/**
 * Provider refund repayment gateway selection, retry, and admin confirm safety.
 * Run: node tests/refundRepayment.gateway.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const { randomUUID } = require("crypto");
const AppError = require("../src/utils/AppError");
const {
  deriveRepaymentStatus,
  pendingRepaymentAwaitsAdmin,
  serializePendingRepayment,
  resolveRepaymentCheckoutProvider,
  assertGatewayRepaymentIntentPayable,
} = require("../src/services/refundRecovery.service");
const {
  buildCheckoutInitializePayload,
  assertInitializeRepaymentPayload,
} = require("../src/services/payments/paystack.payload");
const { disputeGrossToLaborNet, grossToNetLaborRefund } = require("../src/utils/refundMath.util");

function testResolveProviderSelection() {
  assert.strictEqual(
    resolveRepaymentCheckoutProvider("PAYSTACK", ["PAYFAST", "PAYSTACK"]),
    "PAYSTACK"
  );
  assert.strictEqual(
    resolveRepaymentCheckoutProvider("PAYFAST", ["PAYFAST", "PAYSTACK"]),
    "PAYFAST"
  );

  let unknown = false;
  try {
    resolveRepaymentCheckoutProvider("NOPE", ["PAYFAST", "PAYSTACK"]);
  } catch (e) {
    unknown = e instanceof AppError && e.statusCode === 400;
  }
  assert.strictEqual(unknown, true, "unknown provider must 400");

  let disabled = false;
  try {
    resolveRepaymentCheckoutProvider("PAYSTACK", ["PAYFAST"]);
  } catch (e) {
    disabled = e instanceof AppError && e.statusCode === 400;
  }
  assert.strictEqual(disabled, true, "disabled provider must 400, not fall back");

  assert.strictEqual(
    resolveRepaymentCheckoutProvider(undefined, ["PAYFAST", "PAYSTACK"]),
    "PAYFAST"
  );
  assert.strictEqual(resolveRepaymentCheckoutProvider("", ["PAYSTACK"]), "PAYSTACK");
}

function testPendingStatusHelpers() {
  assert.strictEqual(pendingRepaymentAwaitsAdmin(null), false);
  assert.strictEqual(pendingRepaymentAwaitsAdmin({ id: "x" }), true);
  assert.strictEqual(
    pendingRepaymentAwaitsAdmin({
      method: "GATEWAY",
      gatewayPaymentVerified: false,
      paymentIntentState: "PENDING",
    }),
    false
  );
  assert.strictEqual(
    pendingRepaymentAwaitsAdmin({
      method: "GATEWAY",
      gatewayPaymentVerified: true,
      paymentIntentState: "PAID",
    }),
    true
  );
  assert.strictEqual(
    deriveRepaymentStatus({
      recoveryStatus: "PENDING",
      balance: 232.5,
      pendingRepayment: {
        method: "GATEWAY",
        gatewayPaymentVerified: false,
        paymentIntentState: "FAILED",
      },
    }),
    "REFUND_DUE"
  );

  const dto = serializePendingRepayment(
    {
      id: "rr-1",
      amount: 232.5,
      reference: "EFX",
      status: "SUBMITTED",
      jobId: "job-1",
      createdAt: new Date("2026-09-13T00:00:00.000Z"),
      method: "GATEWAY",
    },
    {
      kind: "PROVIDER_REFUND_REPAYMENT",
      state: "PENDING",
      provider: "PAYFAST",
    }
  );
  assert.strictEqual(dto.gatewayProvider, "PAYFAST");
  assert.strictEqual(dto.paymentIntentState, "PENDING");
  assert.strictEqual(dto.gatewayPaymentVerified, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(dto, "gatewayPayload"));
}

function testAdminConfirmGuard() {
  assert.strictEqual(
    assertGatewayRepaymentIntentPayable(
      { method: "BANK_TRANSFER", amount: 232.5 },
      null
    ),
    true
  );

  const baseRepayment = {
    method: "GATEWAY",
    paymentIntentId: "pi-1",
    amount: 232.5,
    jobId: "job-1",
    provider: { userId: "user-1" },
  };
  const paidIntent = {
    id: "pi-1",
    kind: "PROVIDER_REFUND_REPAYMENT",
    state: "PAID",
    paidAt: new Date(),
    gatewayTransactionId: "tx-1",
    merchantReference: "EFX-RR-1",
    userId: "user-1",
    jobId: "job-1",
    amount: 232.5,
  };
  assert.strictEqual(assertGatewayRepaymentIntentPayable(baseRepayment, paidIntent), true);

  for (const state of ["PENDING", "FAILED", "CANCELLED"]) {
    let threw = false;
    try {
      assertGatewayRepaymentIntentPayable(baseRepayment, { ...paidIntent, state, paidAt: null });
    } catch (e) {
      threw = e instanceof AppError && e.statusCode === 409;
    }
    assert.strictEqual(threw, true, `admin must not confirm ${state} gateway repayment`);
  }
}

function testPaystackNoSplitAndCommission() {
  const payload = buildCheckoutInitializePayload(
    {
      id: "repay-1",
      merchantReference: "EFX-RR-ABCDEF1234567890",
      kind: "PROVIDER_REFUND_REPAYMENT",
      amount: 232.5,
      currency: "ZAR",
      jobId: "job-1",
    },
    { email: "provider@example.test" },
    { subaccountCode: "ACCT_MUST_BE_IGNORED" }
  );
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "subaccount"));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "bearer"));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "percentage_charge"));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "transaction_charge"));
  assertInitializeRepaymentPayload(payload);
  assert.strictEqual(payload.amount, 23250);
}

function testRefundMathUnchanged() {
  assert.strictEqual(grossToNetLaborRefund(250, 250), 232.5);
  const depositJob = {
    laborPaid: true,
    legacyEscrowV2: false,
    totalPrice: 500,
    quotedAmount: 500,
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    firstPaymentAmount: 250,
    secondPaymentAmount: 250,
    paymentProgress: "FIRST_PAID",
  };
  const depositMeta = { laborPaid: true, depositPayment: { status: "paid", amount: 250 } };
  assert.strictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, depositJob, depositMeta), 232.5);
  const unpaidCompletion = disputeGrossToLaborNet("FULL_REFUND", 0, depositJob, depositMeta);
  assert.notStrictEqual(unpaidCompletion, 465);
  assert.strictEqual(unpaidCompletion, 232.5);
}

testResolveProviderSelection();
testPendingStatusHelpers();
testAdminConfirmGuard();
testPaystackNoSplitAndCommission();
testRefundMathUnchanged();
console.log("refundRepayment.gateway.test.js: unit helpers OK");

async function createJobFixtures(prisma, suffix, { debtAmount = 232.5, extraJob = false } = {}) {
  const providerUser = await prisma.user.create({
    data: {
      email: `gw-repay-prov-${suffix}@example.com`,
      password: "hash",
      name: "Gateway Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: { userId: providerUser.id, approved: true },
  });
  const customerUser = await prisma.user.create({
    data: {
      email: `gw-repay-cust-${suffix}@example.com`,
      password: "hash",
      name: "Gateway Customer",
      role: "CUSTOMER",
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: `gw-repay-admin-${suffix}@example.com`,
      password: "hash",
      name: "Gateway Admin",
      role: "ADMIN",
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `Gateway repay ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "refund repayment",
      price: 250,
      customerId: customerUser.id,
      providerId: providerUser.id,
      status: "ACCEPTED",
      meta: {
        refund: {
          pendingRefund: debtAmount,
          immediateRefund: 0,
          customerRefundStatus: null,
        },
      },
    },
  });
  const recovery = await prisma.refundRecovery.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      customerId: customerUser.id,
      jobId: job.id,
      totalPending: debtAmount,
      recoveredAmount: 0,
      status: "PENDING",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reference: `EFX-GW-${suffix}`,
    },
  });
  await prisma.earning.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      jobId: job.id,
      amount: debtAmount,
      type: "debit",
      status: "refund_debt",
    },
  });
  let jobB = null;
  let customerB = null;
  if (extraJob) {
    customerB = await prisma.user.create({
      data: {
        email: `gw-repay-custb-${suffix}@example.com`,
        password: "hash",
        name: "Gateway Customer B",
        role: "CUSTOMER",
      },
    });
    jobB = await prisma.job.create({
      data: {
        title: `Gateway repay B ${suffix}`,
        category: "plumbing",
        location: "Cape Town",
        description: "second job",
        price: 250,
        customerId: customerB.id,
        providerId: providerUser.id,
        status: "ACCEPTED",
        meta: {
          refund: {
            pendingRefund: debtAmount,
            immediateRefund: 0,
            customerRefundStatus: null,
          },
        },
      },
    });
    await prisma.refundRecovery.create({
      data: {
        id: randomUUID(),
        providerId: provider.id,
        customerId: customerB.id,
        jobId: jobB.id,
        totalPending: debtAmount,
        recoveredAmount: 0,
        status: "PENDING",
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reference: `EFX-GW-B-${suffix}`,
      },
    });
    await prisma.earning.create({
      data: {
        id: randomUUID(),
        providerId: provider.id,
        jobId: jobB.id,
        amount: debtAmount,
        type: "debit",
        status: "refund_debt",
      },
    });
  }
  return { providerUser, provider, customerUser, customerB, adminUser, job, jobB, recovery, debtAmount };
}

async function cleanupJobFixtures(prisma, fixtures) {
  if (!fixtures) return;
  const jobIds = [fixtures.job?.id, fixtures.jobB?.id].filter(Boolean);
  await prisma.providerRefundRepayment
    .deleteMany({ where: { providerId: fixtures.provider.id } })
    .catch(() => {});
  if (jobIds.length) {
    await prisma.paymentIntent.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } }).catch(() => {});
  }
  await prisma.refundRecovery.deleteMany({ where: { providerId: fixtures.provider.id } }).catch(() => {});
  await prisma.earning.deleteMany({ where: { providerId: fixtures.provider.id } }).catch(() => {});
  await prisma.provider.delete({ where: { id: fixtures.provider.id } }).catch(() => {});
  await prisma.user
    .deleteMany({
      where: {
        id: {
          in: [
            fixtures.providerUser.id,
            fixtures.customerUser.id,
            fixtures.adminUser.id,
            fixtures.customerB?.id,
          ].filter(Boolean),
        },
      },
    })
    .catch(() => {});
}

function installGatewayMocks({ verifyState = "FAILED", verifyThrows = false } = {}) {
  const registry = require("../src/services/payments/gatewayRegistry");
  const originals = {
    getGateway: registry.getGateway,
    listEnabledGateways: registry.listEnabledGateways,
  };
  const calls = [];
  registry.listEnabledGateways = () => ["PAYFAST", "PAYSTACK"];
  registry.getGateway = (key) => {
    const k = String(key || "").toUpperCase();
    return {
      createCheckout: async (intent) => {
        calls.push({
          op: "checkout",
          provider: k,
          merchantReference: intent.merchantReference,
          kind: intent.kind,
          commissionAmount: intent.commissionAmount,
        });
        return { type: "redirect", url: `https://checkout.test/${k}`, method: "GET" };
      },
      verifyTransaction: async (reference) => {
        calls.push({ op: "verify", provider: k, reference });
        if (verifyThrows) {
          throw new Error("paystack verify timeout");
        }
        return {
          valid: true,
          merchantReference: reference,
          gatewayTransactionId: `tx-${reference}`,
          state: verifyState,
          amount: 232.5,
          currency: "ZAR",
        };
      },
      isConfigured: () => true,
    };
  };
  return {
    calls,
    restore() {
      registry.getGateway = originals.getGateway;
      registry.listEnabledGateways = originals.listEnabledGateways;
    },
  };
}

function installNotifySpy() {
  const notificationEvents = require("../src/services/notificationEvents.service");
  const originals = {
    notifyAdminRefundRepaymentSubmitted: notificationEvents.notifyAdminRefundRepaymentSubmitted,
    notifyProviderRepaymentSubmitted: notificationEvents.notifyProviderRepaymentSubmitted,
  };
  const adminCalls = [];
  notificationEvents.notifyAdminRefundRepaymentSubmitted = async (args) => {
    adminCalls.push(args);
  };
  notificationEvents.notifyProviderRepaymentSubmitted = async () => {};
  return {
    adminCalls,
    restore() {
      notificationEvents.notifyAdminRefundRepaymentSubmitted =
        originals.notifyAdminRefundRepaymentSubmitted;
      notificationEvents.notifyProviderRepaymentSubmitted =
        originals.notifyProviderRepaymentSubmitted;
    },
  };
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const refundRecovery = require("../src/services/refundRecovery.service");
  const { Prisma } = require("@prisma/client");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fixtures = await createJobFixtures(prisma, `${suffix}-sel`);
  const gw = installGatewayMocks();
  const notify = installNotifySpy();
  try {
    const paystack = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixtures.providerUser.id,
      fixtures.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(paystack.provider, "PAYSTACK");
    assert.strictEqual(gw.calls.filter((c) => c.op === "checkout" && c.provider === "PAYSTACK").length, 1);
    assert.strictEqual(notify.adminCalls.length, 0, "opening checkout must not notify admin");

    const intent = await prisma.paymentIntent.findUnique({ where: { id: paystack.intentId } });
    assert.strictEqual(String(intent.kind), "PROVIDER_REFUND_REPAYMENT");
    assert.strictEqual(Number(intent.commissionAmount), 0);
    assert.strictEqual(String(intent.provider), "PAYSTACK");

    const countAfterFirst = await prisma.providerRefundRepayment.count({
      where: { providerId: fixtures.provider.id, jobId: fixtures.job.id },
    });
    assert.strictEqual(countAfterFirst, 1);
  } finally {
    gw.restore();
    notify.restore();
    await cleanupJobFixtures(prisma, fixtures);
  }

  const fixturesFast = await createJobFixtures(prisma, `${suffix}-pf`);
  const gwFast = installGatewayMocks();
  try {
    const first = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesFast.providerUser.id,
      fixturesFast.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    assert.strictEqual(first.provider, "PAYFAST");
    const firstRef = first.merchantReference;
    const firstIntentId = first.intentId;
    const firstRepaymentId = first.repaymentId;

    const retry = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesFast.providerUser.id,
      fixturesFast.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    assert.strictEqual(retry.intentId, firstIntentId);
    assert.strictEqual(retry.merchantReference, firstRef);
    assert.strictEqual(retry.repaymentId, firstRepaymentId);
    const repayCount = await prisma.providerRefundRepayment.count({
      where: { providerId: fixturesFast.provider.id, jobId: fixturesFast.job.id },
    });
    const intentCount = await prisma.paymentIntent.count({
      where: {
        jobId: fixturesFast.job.id,
        kind: "PROVIDER_REFUND_REPAYMENT",
      },
    });
    assert.strictEqual(repayCount, 1);
    assert.strictEqual(intentCount, 1);

    let switched = false;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixturesFast.providerUser.id,
        fixturesFast.job.id,
        { provider: "PAYSTACK", amount: 232.5 }
      );
    } catch (e) {
      switched = e instanceof AppError && e.statusCode === 409;
    }
    assert.strictEqual(switched, true, "unresolved PayFast cannot switch to Paystack");
  } finally {
    gwFast.restore();
    await cleanupJobFixtures(prisma, fixturesFast);
  }

  const fixturesOmit = await createJobFixtures(prisma, `${suffix}-omit`);
  const gwOmit = installGatewayMocks();
  try {
    const omitted = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesOmit.providerUser.id,
      fixturesOmit.job.id,
      { amount: 232.5 }
    );
    assert.strictEqual(omitted.provider, "PAYFAST");

    let bad = false;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixturesOmit.providerUser.id,
        fixturesOmit.jobB ? fixturesOmit.jobB.id : fixturesOmit.job.id,
        { provider: "NOT_A_GATEWAY", amount: 232.5 }
      );
    } catch (e) {
      bad = e instanceof AppError && e.statusCode === 400;
    }
    assert.strictEqual(bad, true);
  } finally {
    gwOmit.restore();
    await cleanupJobFixtures(prisma, fixturesOmit);
  }

  const fixturesJobs = await createJobFixtures(prisma, `${suffix}-jobs`, { extraJob: true });
  const gwJobs = installGatewayMocks();
  try {
    await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesJobs.providerUser.id,
      fixturesJobs.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    const jobBCheckout = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesJobs.providerUser.id,
      fixturesJobs.jobB.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(jobBCheckout.provider, "PAYSTACK");
    const aCount = await prisma.providerRefundRepayment.count({
      where: { providerId: fixturesJobs.provider.id, jobId: fixturesJobs.job.id, status: "SUBMITTED" },
    });
    const bCount = await prisma.providerRefundRepayment.count({
      where: { providerId: fixturesJobs.provider.id, jobId: fixturesJobs.jobB.id, status: "SUBMITTED" },
    });
    assert.strictEqual(aCount, 1);
    assert.strictEqual(bCount, 1);
  } finally {
    gwJobs.restore();
    await cleanupJobFixtures(prisma, fixturesJobs);
  }

  const fixturesPs = await createJobFixtures(prisma, `${suffix}-ps`);
  try {
    const paidGw = installGatewayMocks({ verifyState: "PAID" });
    const first = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesPs.providerUser.id,
      fixturesPs.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    const beforeCount = await prisma.paymentIntent.count({
      where: { jobId: fixturesPs.job.id, kind: "PROVIDER_REFUND_REPAYMENT" },
    });
    const paid = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesPs.providerUser.id,
      fixturesPs.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(paid.gatewayPaymentVerified, true);
    assert.strictEqual(paid.status, "AWAITING_VERIFICATION");
    const afterPaidCount = await prisma.paymentIntent.count({
      where: { jobId: fixturesPs.job.id, kind: "PROVIDER_REFUND_REPAYMENT" },
    });
    assert.strictEqual(beforeCount, afterPaidCount);
    assert.strictEqual(paid.intentId, first.intentId);
    paidGw.restore();

    await prisma.paymentIntent.update({
      where: { id: first.intentId },
      data: { state: "PENDING", paidAt: null, gatewayTransactionId: null },
    });
    const procGw = installGatewayMocks({ verifyState: "PROCESSING" });
    const processing = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesPs.providerUser.id,
      fixturesPs.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(processing.status, "PROCESSING");
    assert.strictEqual(processing.intentId, first.intentId);
    procGw.restore();

    const failGw = installGatewayMocks({ verifyState: "FAILED" });
    const failedRetry = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesPs.providerUser.id,
      fixturesPs.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.notStrictEqual(failedRetry.merchantReference, first.merchantReference);
    assert.strictEqual(failedRetry.intentId, first.intentId);
    const stillOne = await prisma.paymentIntent.count({
      where: { jobId: fixturesPs.job.id, kind: "PROVIDER_REFUND_REPAYMENT" },
    });
    assert.strictEqual(stillOne, 1);
    failGw.restore();

    await prisma.paymentIntent.update({
      where: { id: first.intentId },
      data: { state: "PENDING", paidAt: null },
    });
    const uncertain = installGatewayMocks({ verifyThrows: true });
    let closed = false;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixturesPs.providerUser.id,
        fixturesPs.job.id,
        { provider: "PAYSTACK", amount: 232.5 }
      );
    } catch (e) {
      closed = e instanceof AppError && e.statusCode === 503;
    }
    assert.strictEqual(closed, true, "Paystack verify uncertainty must fail closed");
    uncertain.restore();
  } finally {
    await cleanupJobFixtures(prisma, fixturesPs);
  }

  const fixturesAdmin = await createJobFixtures(prisma, `${suffix}-adm`);
  const gwAdmin = installGatewayMocks();
  const notifyAdmin = installNotifySpy();
  try {
    const created = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesAdmin.providerUser.id,
      fixturesAdmin.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    assert.strictEqual(notifyAdmin.adminCalls.length, 0);

    let pendingBlocked = false;
    try {
      await refundRecovery.confirmAdminRefundRepayment(fixturesAdmin.adminUser.id, created.repaymentId);
    } catch (e) {
      pendingBlocked = e instanceof AppError && e.statusCode === 409;
    }
    assert.strictEqual(pendingBlocked, true);

    await prisma.paymentIntent.update({
      where: { id: created.intentId },
      data: { state: "FAILED", failedAt: new Date() },
    });
    let failedBlocked = false;
    try {
      await refundRecovery.confirmAdminRefundRepayment(fixturesAdmin.adminUser.id, created.repaymentId);
    } catch (e) {
      failedBlocked = e instanceof AppError && e.statusCode === 409;
    }
    assert.strictEqual(failedBlocked, true);

    await prisma.paymentIntent.update({
      where: { id: created.intentId },
      data: {
        state: "PAID",
        paidAt: new Date(),
        gatewayTransactionId: "pf-tx-1",
        amount: new Prisma.Decimal("232.50"),
      },
    });
    const confirmed = await refundRecovery.confirmAdminRefundRepayment(
      fixturesAdmin.adminUser.id,
      created.repaymentId
    );
    assert.ok(confirmed.repayment);
    const again = await refundRecovery.confirmAdminRefundRepayment(
      fixturesAdmin.adminUser.id,
      created.repaymentId
    );
    assert.strictEqual(again.idempotent, true);

    await refundRecovery.markGatewayRepaymentPaidFromIntent(
      await prisma.paymentIntent.findUnique({ where: { id: created.intentId } })
    );
    assert.ok(notifyAdmin.adminCalls.length >= 1, "authoritative paid hook must notify admin");

    const bank = await refundRecovery.submitProviderRepayment(fixturesAdmin.providerUser.id, {
      amount: 0,
      reference: "BANK-AFTER",
      jobId: fixturesAdmin.job.id,
    }).catch((e) => e);
    assert.ok(bank instanceof AppError, "no leftover debt after confirm");
  } finally {
    gwAdmin.restore();
    notifyAdmin.restore();
    await cleanupJobFixtures(prisma, fixturesAdmin);
  }

  const fixturesScope = await createJobFixtures(prisma, `${suffix}-scope`, { extraJob: true });
  const gwScope = installGatewayMocks();
  try {
    const checkoutA = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesScope.providerUser.id,
      fixturesScope.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    const checkoutB = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesScope.providerUser.id,
      fixturesScope.jobB.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );

    const expectedA = await refundRecovery.getProviderExpectedRepaymentAmount(
      fixturesScope.provider.id,
      { jobId: fixturesScope.job.id }
    );
    const expectedB = await refundRecovery.getProviderExpectedRepaymentAmount(
      fixturesScope.provider.id,
      { jobId: fixturesScope.jobB.id }
    );
    const expectedAll = await refundRecovery.getProviderExpectedRepaymentAmount(
      fixturesScope.provider.id
    );
    assert.strictEqual(expectedA.expectedAmount, 232.5);
    assert.strictEqual(expectedB.expectedAmount, 232.5);
    assert.strictEqual(expectedAll.expectedAmount, 465);

    const reviews = await refundRecovery.listAdminRefundRepayments({ view: "reviews" });
    const adminA = reviews.find((r) => r.id === checkoutA.repaymentId);
    const adminB = reviews.find((r) => r.id === checkoutB.repaymentId);
    assert.strictEqual(adminA.expectedAmount, 232.5);
    assert.strictEqual(adminB.expectedAmount, 232.5);
    assert.strictEqual(adminA.amountMismatch, false);
    assert.strictEqual(adminB.amountMismatch, false);

    const summaryBoth = await refundRecovery.getProviderRefundDebtSummary(fixturesScope.provider.id);
    const recA = summaryBoth.recoveries.find((r) => r.jobId === fixturesScope.job.id);
    const recB = summaryBoth.recoveries.find((r) => r.jobId === fixturesScope.jobB.id);
    assert.ok(recA && recB);
    assert.strictEqual(recA.pendingRepayment.id, checkoutA.repaymentId);
    assert.strictEqual(recB.pendingRepayment.id, checkoutB.repaymentId);
    assert.strictEqual(recA.repaymentStatus, "REFUND_DUE");
    assert.strictEqual(recB.repaymentStatus, "REFUND_DUE");

    await prisma.paymentIntent.update({
      where: { id: checkoutB.intentId },
      data: {
        state: "PAID",
        paidAt: new Date(),
        gatewayTransactionId: "ps-job-b",
        amount: new Prisma.Decimal("232.50"),
      },
    });

    const summaryPaidB = await refundRecovery.getProviderRefundDebtSummary(fixturesScope.provider.id);
    const recAAfterPaidB = summaryPaidB.recoveries.find((r) => r.jobId === fixturesScope.job.id);
    const recBAfterPaidB = summaryPaidB.recoveries.find((r) => r.jobId === fixturesScope.jobB.id);
    assert.strictEqual(recAAfterPaidB.repaymentStatus, "REFUND_DUE");
    assert.strictEqual(recBAfterPaidB.repaymentStatus, "AWAITING_VERIFICATION");
    assert.strictEqual(recBAfterPaidB.pendingRepayment.gatewayPaymentVerified, true);
    assert.notStrictEqual(recAAfterPaidB.pendingRepayment.id, recBAfterPaidB.pendingRepayment.id);

    const jobAMetaBefore = await prisma.job.findUnique({
      where: { id: fixturesScope.job.id },
      select: { meta: true },
    });

    const confirmedB = await refundRecovery.confirmAdminRefundRepayment(
      fixturesScope.adminUser.id,
      checkoutB.repaymentId
    );
    assert.ok(confirmedB.repayment);
    assert.ok(
      !(confirmedB.customerRefund?.results || []).some((r) => r.jobId === fixturesScope.job.id),
      "Job A must not appear in Job B customer-refund results"
    );

    const recoveryA = await prisma.refundRecovery.findFirst({
      where: { providerId: fixturesScope.provider.id, jobId: fixturesScope.job.id },
    });
    const recoveryB = await prisma.refundRecovery.findFirst({
      where: { providerId: fixturesScope.provider.id, jobId: fixturesScope.jobB.id },
    });
    assert.strictEqual(Number(recoveryA.recoveredAmount), 0);
    assert.strictEqual(recoveryA.status, "PENDING");
    assert.strictEqual(Number(recoveryB.recoveredAmount), 232.5);
    assert.strictEqual(recoveryB.status, "RECOVERED");

    const debtA = await prisma.earning.findMany({
      where: {
        providerId: fixturesScope.provider.id,
        jobId: fixturesScope.job.id,
        type: "debit",
        status: "refund_debt",
      },
    });
    const debtB = await prisma.earning.findMany({
      where: {
        providerId: fixturesScope.provider.id,
        jobId: fixturesScope.jobB.id,
        type: "debit",
        status: "refund_debt",
      },
    });
    assert.strictEqual(debtA.length, 1);
    assert.strictEqual(Number(debtA[0].amount), 232.5);
    assert.strictEqual(debtB.length, 0);

    const jobAAfter = await prisma.job.findUnique({
      where: { id: fixturesScope.job.id },
      select: { meta: true },
    });
    const jobBAfter = await prisma.job.findUnique({
      where: { id: fixturesScope.jobB.id },
      select: { meta: true },
    });
    assert.deepStrictEqual(jobAAfter.meta, jobAMetaBefore.meta);
    const jobBRefund =
      jobBAfter.meta && typeof jobBAfter.meta === "object" ? jobBAfter.meta.refund : null;
    assert.ok(jobBRefund && jobBRefund.customerRefundStatus);

    await prisma.paymentIntent.update({
      where: { id: checkoutA.intentId },
      data: {
        state: "PAID",
        paidAt: new Date(),
        gatewayTransactionId: "pf-job-a",
        amount: new Prisma.Decimal("232.50"),
      },
    });
    await refundRecovery.confirmAdminRefundRepayment(
      fixturesScope.adminUser.id,
      checkoutA.repaymentId
    );
    const recoveryA2 = await prisma.refundRecovery.findFirst({
      where: { providerId: fixturesScope.provider.id, jobId: fixturesScope.job.id },
    });
    assert.strictEqual(Number(recoveryA2.recoveredAmount), 232.5);
    assert.strictEqual(recoveryA2.status, "RECOVERED");
    const stillB = await prisma.refundRecovery.findFirst({
      where: { providerId: fixturesScope.provider.id, jobId: fixturesScope.jobB.id },
    });
    assert.strictEqual(Number(stillB.recoveredAmount), 232.5);
  } finally {
    gwScope.restore();
    await cleanupJobFixtures(prisma, fixturesScope);
  }

  const fixturesBank = await createJobFixtures(prisma, `${suffix}-bank`);
  try {
    const row = await refundRecovery.submitProviderRepayment(fixturesBank.providerUser.id, {
      amount: 232.5,
      reference: "EFT-REF",
      jobId: fixturesBank.job.id,
    });
    const confirmed = await refundRecovery.confirmAdminRefundRepayment(
      fixturesBank.adminUser.id,
      row.id
    );
    assert.ok(confirmed.repayment);
    const reloaded = await prisma.providerRefundRepayment.findUnique({ where: { id: row.id } });
    assert.strictEqual(reloaded.status, "CONFIRMED");
  } finally {
    await cleanupJobFixtures(prisma, fixturesBank);
  }

  console.log("refundRepayment.gateway.test.js: OK (DB integration)");
}

async function main() {
  if (!process.env.DATABASE_URL || /placeholder@/.test(process.env.DATABASE_URL)) {
    const fs = require("fs");
    const envPath = require("path").join(__dirname, "..", ".env");
    let raw = "";
    try {
      raw = fs.readFileSync(envPath, "utf8");
    } catch {
      raw = "";
    }
    const match = raw.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  if (!process.env.DATABASE_URL || /placeholder@/.test(process.env.DATABASE_URL)) {
    console.log("refundRepayment.gateway.test.js: skipped DB integration (no DATABASE_URL)");
    return;
  }
  await runDbIntegrationTests();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
