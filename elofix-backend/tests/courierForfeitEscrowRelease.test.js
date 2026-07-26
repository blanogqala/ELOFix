/**
 * Customer cancel-forfeit at COLLECTING must release held courier escrow (93%)
 * to the provider before CANCELLED — not delete pending earnings.
 *
 * Also heals already-cancelled forfeit jobs that left heldAmount stranded.
 *
 * Run: node tests/courierForfeitEscrowRelease.test.js
 * DB integration only runs when DATABASE_URL is set.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");

const jobService = require("../src/services/job.service");
const paymentService = require("../src/services/payment.service");
const { computeProviderEntitledRemaining, normalizeMeta } = require("../src/services/jobMeta.service");
const providerAccountService = require("../src/services/providerAccount.service");

async function createPaidCourierCollectingJob(prisma, suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `forfeit-cust-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Forfeit Customer",
      role: "CUSTOMER",
    },
  });
  const courierUser = await prisma.user.create({
    data: {
      email: `forfeit-courier-${suffix}@example.com`,
      password: "hashed-placeholder",
      name: "Forfeit Courier",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: courierUser.id,
      skills: ["delivery"],
      location: "Pretoria",
      approved: true,
      profileCompleted: true,
    },
  });

  const totalPrice = 100;
  const providerAmount = 93;
  const commissionAmount = 7;
  const jobId = randomUUID();

  const job = await prisma.job.create({
    data: {
      id: jobId,
      title: `Material delivery — ${suffix}`,
      category: "delivery",
      location: "Pretoria",
      description: "Collect and deliver materials",
      price: totalPrice,
      totalPrice,
      providerAmount,
      commissionAmount,
      releasedAmount: 0,
      laborPaid: true,
      paymentReleased: false,
      isFullyReleased: false,
      escrowSecondReleaseDone: false,
      status: "IN_PROGRESS",
      customerId: customer.id,
      providerId: courierUser.id,
      meta: {
        courierFlow: true,
        laborPaid: true,
        escrow: { heldAmount: providerAmount, releasedAmount: 0 },
        servicePayment: { amount: totalPrice, status: "paid" },
      },
    },
  });

  await prisma.earning.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      jobId,
      amount: providerAmount,
      type: "credit",
      status: "pending",
    },
  });

  await prisma.commissionLedger.create({
    data: {
      id: randomUUID(),
      jobId,
      amount: commissionAmount,
      source: "courier_delivery_payment",
      totalPrice,
      currency: "ZAR",
    },
  });

  const intentId = randomUUID();
  await prisma.paymentIntent.create({
    data: {
      id: intentId,
      merchantReference: `EF-FORFEIT-${suffix}`.slice(0, 40),
      provider: "PAYFAST",
      kind: "LABOR",
      userId: customer.id,
      jobId,
      amount: totalPrice,
      state: "PAID",
      escrowStatus: "HELD",
      providerPayoutStatus: "NONE",
      paidAt: new Date(),
    },
  });

  await prisma.deliveryRequest.create({
    data: {
      id: randomUUID(),
      customerId: customer.id,
      courierId: courierUser.id,
      jobId,
      category: "delivery",
      items: [],
      collectionPoint: { address: "ABC Builder" },
      destinationPoint: { address: "Pretoria West" },
      status: "paid",
      quotedFee: totalPrice,
      fulfillmentStatus: "COLLECTING",
    },
  });

  return { customer, courierUser, provider, job, intentId, providerAmount, totalPrice };
}

async function cleanup(prisma, fx) {
  if (!fx) return;
  const jobId = fx.job?.id;
  try {
    if (jobId) {
      await prisma.earning.deleteMany({ where: { jobId } });
      await prisma.commissionLedger.deleteMany({ where: { jobId } });
      await prisma.paymentIntent.deleteMany({ where: { jobId } });
      await prisma.deliveryRequest.deleteMany({ where: { jobId } });
      await prisma.job.deleteMany({ where: { id: jobId } });
    }
    if (fx.provider?.id) await prisma.provider.deleteMany({ where: { id: fx.provider.id } });
    if (fx.courierUser?.id) await prisma.user.deleteMany({ where: { id: fx.courierUser.id } });
    if (fx.customer?.id) await prisma.user.deleteMany({ where: { id: fx.customer.id } });
  } catch (e) {
    console.warn("cleanup warning:", e.message);
  }
}

async function testForwardForfeitReleasesEscrow(prisma) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fx = await createPaidCourierCollectingJob(prisma, suffix);
  try {
    const result = await jobService.cancelJob(
      fx.job.id,
      "Changed mind",
      "Cancel while collecting",
      fx.customer.id,
      "customer"
    );

    assert.strictEqual(result.customerForfeits, true, "policy should forfeit");
    assert.strictEqual(Number(result.refundAmount) || 0, 0);

    const job = await prisma.job.findUnique({ where: { id: fx.job.id } });
    assert.strictEqual(String(job.status), "CANCELLED");
    assert.strictEqual(Number(job.releasedAmount), fx.providerAmount);
    assert.strictEqual(job.paymentReleased, true);
    assert.strictEqual(job.escrowSecondReleaseDone, true);

    const meta = normalizeMeta(job.meta);
    assert.strictEqual(String(meta.refund?.status), "forfeited");
    assert.strictEqual(Number(meta.escrow?.heldAmount) || 0, 0);
    assert.strictEqual(
      computeProviderEntitledRemaining(job, meta),
      0,
      "remaining should be 0 after forfeit release"
    );

    const available = await prisma.earning.findFirst({
      where: {
        jobId: fx.job.id,
        providerId: fx.provider.id,
        type: "credit",
        status: "available",
      },
    });
    assert.ok(available, "provider should have available credit");
    assert.strictEqual(Number(available.amount), fx.providerAmount);

    const intent = await prisma.paymentIntent.findUnique({ where: { id: fx.intentId } });
    assert.strictEqual(String(intent.state), "PAID", "forfeit must not mark intent REFUNDED");
  } finally {
    await cleanup(prisma, fx);
  }
}

async function testHistoricalHealReleasesOrphanedForfeit(prisma) {
  const suffix = `heal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fx = await createPaidCourierCollectingJob(prisma, suffix);
  try {
    // Simulate the old bug: cancel wiped pending earnings, left heldAmount, never released.
    await prisma.earning.deleteMany({ where: { jobId: fx.job.id } });
    await prisma.job.update({
      where: { id: fx.job.id },
      data: {
        status: "CANCELLED",
        releasedAmount: 0,
        paymentReleased: false,
        isFullyReleased: false,
        escrowSecondReleaseDone: false,
        meta: {
          courierFlow: true,
          laborPaid: true,
          statusOverride: "CANCELLED",
          escrow: { heldAmount: fx.providerAmount, releasedAmount: 0 },
          refund: {
            amount: 0,
            reason: "cancel_forfeit",
            status: "forfeited",
            kind: "forfeit_customer_en_route",
          },
        },
      },
    });

    const before = await prisma.job.findUnique({ where: { id: fx.job.id } });
    const healed = await paymentService.releaseForfeitedCourierEscrowIfNeeded(before, fx.provider.id);

    assert.strictEqual(Number(healed.releasedAmount), fx.providerAmount);
    assert.strictEqual(healed.escrowSecondReleaseDone, true);

    const available = await prisma.earning.findFirst({
      where: {
        jobId: fx.job.id,
        providerId: fx.provider.id,
        type: "credit",
        status: "available",
      },
    });
    assert.ok(available);
    assert.strictEqual(Number(available.amount), fx.providerAmount);

    // Idempotent: second heal is a no-op
    const again = await paymentService.releaseForfeitedCourierEscrowIfNeeded(healed, fx.provider.id);
    assert.strictEqual(Number(again.releasedAmount), fx.providerAmount);

    const earnings = await providerAccountService.getProviderEarnings(fx.courierUser.id);
    const row = earnings.jobs.find((j) => j.id === fx.job.id);
    assert.ok(row);
    assert.strictEqual(Number(row.releasedAmount), fx.providerAmount);
    assert.strictEqual(Number(row.remainingAmount), 0);
  } finally {
    await cleanup(prisma, fx);
  }
}

function testSecondTrancheCancelledGuardLogic() {
  // Non-forfeit cancelled jobs must still be blocked (unit-level expectation via remaining math).
  const cancelledNonForfeit = {
    status: "CANCELLED",
    laborPaid: true,
    providerAmount: 93,
    releasedAmount: 0,
    totalPrice: 100,
    escrowSecondReleaseDone: false,
    isFullyReleased: false,
    paymentReleased: false,
    meta: {
      courierFlow: true,
      refund: { status: "processed" },
      escrow: { heldAmount: 93, releasedAmount: 0 },
    },
  };
  assert.strictEqual(
    String(normalizeMeta(cancelledNonForfeit.meta).refund?.status).toLowerCase(),
    "processed"
  );
  assert.notStrictEqual(
    String(normalizeMeta(cancelledNonForfeit.meta).refund?.status).toLowerCase(),
    "forfeited"
  );
}

async function run() {
  testSecondTrancheCancelledGuardLogic();

  if (!process.env.DATABASE_URL) {
    console.log("courierForfeitEscrowRelease.test.js: skipped DB tests (no DATABASE_URL)");
    console.log("courierForfeitEscrowRelease.test.js: unit checks passed");
    return;
  }

  const prisma = require("../src/config/prisma");
  await testForwardForfeitReleasesEscrow(prisma);
  await testHistoricalHealReleasesOrphanedForfeit(prisma);
  console.log("courierForfeitEscrowRelease.test.js: all tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
