/**
 * Fail-closed payment-mode snapshot + legacy escrow isolation.
 *
 * Proves:
 *  - Explicit legacyEscrowV2 → legacy escrow hold + pending earnings
 *  - New TWO_PAYMENT_50_50 / UPFRONT / ON_COMPLETION → immediate settlement (no hold)
 *  - Missing snapshot on non-legacy → 409 configuration error (never legacy escrow)
 *  - Second tranche skipped when legacyEscrowV2 !== true
 *
 * Courier delivery escrow (meta.courierFlow) is an intentional parallel hold model
 * and is out of scope for this labor-path isolation suite.
 *
 * Run: node tests/paymentSnapshot.failClosed.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");

const paymentModeService = require("../src/services/payments/paymentMode.service");
const paymentService = require("../src/services/payment.service");
const settlement = require("../src/services/payments/settlement.service");

function approxEqual(a, b, eps = 0.02) {
  assert.ok(Math.abs(Number(a) - Number(b)) <= eps, `expected ${a} ≈ ${b}`);
}

function testAssertPaymentModeReadyUnit() {
  paymentModeService.assertPaymentModeReady({
    legacyEscrowV2: true,
    paymentModeSnapshot: null,
  });

  let threw = false;
  try {
    paymentModeService.assertPaymentModeReady({
      legacyEscrowV2: false,
      paymentModeSnapshot: null,
    });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 409);
  }
  assert.ok(threw, "missing snapshot must throw 409");

  paymentModeService.assertPaymentModeReady({
    legacyEscrowV2: false,
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
  });

  // No FULL_UPFRONT fallback when snapshot missing
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(
      { legacyEscrowV2: false, paymentModeSnapshot: null, paymentProgress: "NONE", laborPaid: false },
      {}
    ),
    null
  );
}

function testModeSchedules() {
  for (const mode of [
    "TWO_PAYMENT_50_50",
    "SINGLE_PAYMENT_UPFRONT",
    "SINGLE_PAYMENT_ON_COMPLETION",
  ]) {
    const schedule = paymentModeService.computePaymentSchedule(mode, 10000);
    assert.strictEqual(schedule.paymentMode, mode);
    assert.ok(Number(schedule.quotedAmount) > 0);
    assert.ok(Number(schedule.firstPaymentAmount) > 0);
  }
}

async function createCustomerProviderJob(prisma, { legacyEscrowV2, paymentModeSnapshot, quoted }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `snap.cust.${suffix}@example.com`,
      password: "x",
      name: "Snap Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `snap.prov.${suffix}@example.com`,
      password: "x",
      name: "Snap Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Snap Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });

  const schedule = paymentModeSnapshot
    ? paymentModeService.computePaymentSchedule(paymentModeSnapshot, quoted)
    : null;

  const job = await prisma.job.create({
    data: {
      title: `Snap job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Fail-closed snapshot test job",
      price: quoted,
      totalPrice: quoted,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "ACCEPTED",
      legacyEscrowV2: Boolean(legacyEscrowV2),
      paymentModeSnapshot: paymentModeSnapshot || null,
      quotedAmount: schedule ? schedule.quotedAmount : null,
      firstPaymentAmount: schedule ? schedule.firstPaymentAmount : null,
      secondPaymentAmount: schedule ? schedule.secondPaymentAmount : null,
      paymentProgress: "NONE",
      meta: {
        servicePrice: { amount: quoted, submittedAt: new Date().toISOString() },
        statusOverride: "SERVICE_PRICE_SUBMITTED",
      },
    },
  });

  return { customer, providerUser, provider, job, suffix };
}

async function cleanupJobBundle(prisma, bundle) {
  if (!bundle) return;
  const jobId = bundle.job?.id;
  if (jobId) {
    await prisma.earning.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
  }
  if (bundle.provider?.id) {
    await prisma.provider.delete({ where: { id: bundle.provider.id } }).catch(() => {});
  }
  if (bundle.providerUser?.id) {
    await prisma.user.delete({ where: { id: bundle.providerUser.id } }).catch(() => {});
  }
  if (bundle.customer?.id) {
    await prisma.user.delete({ where: { id: bundle.customer.id } }).catch(() => {});
  }
}

async function testLegacyEscrowHoldCreatesPending(prisma) {
  const bundle = await createCustomerProviderJob(prisma, {
    legacyEscrowV2: true,
    paymentModeSnapshot: null,
    quoted: 10000,
  });
  try {
    const gross = new Prisma.Decimal("10000.00");
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: bundle.job.id } });
      return paymentService.runSettleLaborInTransaction(tx, {
        job,
        jobId: bundle.job.id,
        customerUserId: bundle.customer.id,
        providerProfileId: bundle.provider.id,
        gross,
        paymentRef: `LEGACY-${bundle.suffix}`,
        paidAt: new Date().toISOString(),
        cardLast4: "4242",
        idempotencyKeyForEarnings: `legacy-${bundle.suffix}`,
        channel: "test",
      });
    });

    assert.ok(result.jobRow.laborPaid);
    // Legacy hold: second tranche remains held (not fully released)
    assert.strictEqual(result.jobRow.isFullyReleased, false);
    assert.strictEqual(result.jobRow.escrowSecondReleaseDone, false);
    approxEqual(Number(result.jobRow.releasedAmount), Number(result.firstTranche));

    const pending = await prisma.earning.findFirst({
      where: {
        jobId: bundle.job.id,
        providerId: bundle.provider.id,
        type: "credit",
        status: "pending",
      },
    });
    assert.ok(pending, "legacy escrow must create pending provider earning");
  } finally {
    await cleanupJobBundle(prisma, bundle);
  }
}

async function testNewModeImmediateNoPending(prisma, mode) {
  const bundle = await createCustomerProviderJob(prisma, {
    legacyEscrowV2: false,
    paymentModeSnapshot: mode,
    quoted: 10000,
  });
  try {
    const paymentType =
      mode === "TWO_PAYMENT_50_50"
        ? "DEPOSIT"
        : mode === "SINGLE_PAYMENT_UPFRONT"
          ? "FULL_UPFRONT"
          : "FULL_COMPLETION";

    // ON_COMPLETION requires awaiting confirmation in meta for stage resolution;
    // settleLaborTransactionInTx uses explicit paymentType from intent.
    if (mode === "SINGLE_PAYMENT_ON_COMPLETION") {
      await prisma.job.update({
        where: { id: bundle.job.id },
        data: {
          meta: {
            servicePrice: { amount: 10000 },
            statusOverride: "AWAITING_CONFIRMATION",
          },
        },
      });
    }

    const intent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-SNAP-${bundle.suffix}`.slice(0, 32).toUpperCase(),
        provider: "PAYFAST",
        kind: "LABOR",
        paymentType,
        userId: bundle.customer.id,
        jobId: bundle.job.id,
        amount: mode === "TWO_PAYMENT_50_50" ? 5000 : 10000,
        currency: "ZAR",
        state: "PAID",
        paidAt: new Date(),
        escrowStatus: "NOT_APPLICABLE",
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: bundle.job.id } });
      const intentRow = await tx.paymentIntent.findUnique({ where: { id: intent.id } });
      return settlement.settleLaborTransactionInTx(tx, {
        job,
        jobId: bundle.job.id,
        intent: intentRow,
        customerUserId: bundle.customer.id,
        gross: new Prisma.Decimal(String(intentRow.amount)),
        paymentRef: intentRow.merchantReference,
        paidAt: new Date().toISOString(),
        cardLast4: "4242",
        channel: "test",
        paymentType,
      });
    });

    assert.ok(result.jobRow.laborPaid);
    // Immediate settlement: no escrow hold
    const meta = result.meta || {};
    const held = Number(meta.escrow?.heldAmount || 0);
    assert.strictEqual(held, 0, `${mode} must not create escrow hold`);

    const pending = await prisma.earning.findFirst({
      where: {
        jobId: bundle.job.id,
        providerId: bundle.provider.id,
        type: "credit",
        status: "pending",
      },
    });
    assert.strictEqual(pending, null, `${mode} must not create pending provider earnings`);

    // Second tranche must skip for non-legacy
    const skip = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: bundle.job.id } });
      return paymentService.runSecondTrancheInTransaction(tx, {
        job,
        providerProfileId: bundle.provider.id,
        jobId: bundle.job.id,
      });
    });
    assert.strictEqual(skip.skipped, true);
    assert.strictEqual(skip.reason, "immediate_settlement");
  } finally {
    await cleanupJobBundle(prisma, bundle);
  }
}

async function testMissingSnapshotRejectsSettlement(prisma) {
  const bundle = await createCustomerProviderJob(prisma, {
    legacyEscrowV2: false,
    paymentModeSnapshot: null,
    quoted: 5000,
  });
  try {
    // Clear any accidental snapshot and ensure no service price for lazy snapshot
    await prisma.job.update({
      where: { id: bundle.job.id },
      data: {
        paymentModeSnapshot: null,
        quotedAmount: null,
        firstPaymentAmount: null,
        secondPaymentAmount: null,
        totalPrice: null,
        price: 0,
        meta: { statusOverride: "SERVICE_PRICE_SUBMITTED" },
      },
    });

    const intent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-MISS-${bundle.suffix}`.slice(0, 32).toUpperCase(),
        provider: "PAYFAST",
        kind: "LABOR",
        paymentType: "FULL_UPFRONT",
        userId: bundle.customer.id,
        jobId: bundle.job.id,
        amount: 5000,
        currency: "ZAR",
        state: "PAID",
        paidAt: new Date(),
      },
    });

    let threw = false;
    try {
      await prisma.$transaction(async (tx) => {
        const intentRow = await tx.paymentIntent.findUnique({ where: { id: intent.id } });
        return settlement.settleLaborFromIntent(tx, intentRow, {});
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 409, `expected 409, got ${e.statusCode}: ${e.message}`);
    }
    assert.ok(threw, "missing snapshot must reject settlement");

    const pending = await prisma.earning.findFirst({
      where: { jobId: bundle.job.id, type: "credit", status: "pending" },
    });
    assert.strictEqual(pending, null, "missing snapshot must never create pending earnings");

    const jobAfter = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    assert.strictEqual(jobAfter.laborPaid, false);
  } finally {
    await cleanupJobBundle(prisma, bundle);
  }
}

async function testMissingSnapshotRejectsPayLabor(prisma) {
  const bundle = await createCustomerProviderJob(prisma, {
    legacyEscrowV2: false,
    paymentModeSnapshot: null,
    quoted: 5000,
  });
  try {
    await prisma.job.update({
      where: { id: bundle.job.id },
      data: {
        paymentModeSnapshot: null,
        quotedAmount: null,
        firstPaymentAmount: null,
        secondPaymentAmount: null,
      },
    });

    const jobService = require("../src/services/job.service");
    let threw = false;
    try {
      await jobService.payLabor(bundle.job.id, bundle.customer.id, "4242", null, null, null);
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 409);
    }
    assert.ok(threw, "payLabor without snapshot must throw 409");

    const pending = await prisma.earning.findFirst({
      where: { jobId: bundle.job.id, type: "credit", status: "pending" },
    });
    assert.strictEqual(pending, null);
  } finally {
    await cleanupJobBundle(prisma, bundle);
  }
}

async function main() {
  testAssertPaymentModeReadyUnit();
  testModeSchedules();

  if (!process.env.DATABASE_URL) {
    console.log("paymentSnapshot.failClosed.test.js: OK (unit only, DATABASE_URL not set)");
    return;
  }

  const prisma = require("../src/config/prisma");
  try {
    await testLegacyEscrowHoldCreatesPending(prisma);
    await testNewModeImmediateNoPending(prisma, "TWO_PAYMENT_50_50");
    await testNewModeImmediateNoPending(prisma, "SINGLE_PAYMENT_UPFRONT");
    await testNewModeImmediateNoPending(prisma, "SINGLE_PAYMENT_ON_COMPLETION");
    await testMissingSnapshotRejectsSettlement(prisma);
    await testMissingSnapshotRejectsPayLabor(prisma);
    console.log("paymentSnapshot.failClosed.test.js: OK");
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
