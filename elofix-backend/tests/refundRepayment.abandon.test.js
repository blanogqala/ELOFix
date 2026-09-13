/**
 * Admin abandonment of an unpaid PayFast repayment attempt + late ITN safety.
 * Run: node tests/refundRepayment.abandon.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const { randomUUID } = require("crypto");
const AppError = require("../src/utils/AppError");
const {
  canAbandonUnpaidPayfastAttempt,
  isAbandonedRepaymentAttempt,
} = require("../src/services/refundRecovery.service");
const {
  buildCheckoutInitializePayload,
  assertInitializeRepaymentPayload,
} = require("../src/services/payments/paystack.payload");

function testHelpers() {
  assert.strictEqual(
    canAbandonUnpaidPayfastAttempt(
      { status: "SUBMITTED", method: "GATEWAY" },
      { kind: "PROVIDER_REFUND_REPAYMENT", provider: "PAYFAST", state: "PENDING" }
    ),
    true
  );
  assert.strictEqual(
    canAbandonUnpaidPayfastAttempt(
      { status: "SUBMITTED", method: "GATEWAY" },
      { kind: "PROVIDER_REFUND_REPAYMENT", provider: "PAYFAST", state: "PAID" }
    ),
    false
  );
  assert.strictEqual(
    isAbandonedRepaymentAttempt({
      kind: "PROVIDER_REFUND_REPAYMENT",
      gatewayPayload: { repaymentAttemptAbandoned: true },
    }),
    true
  );
  console.log("refundRepayment.abandon.test.js: unit helpers OK");
}

async function createJobFixtures(prisma, suffix) {
  const providerUser = await prisma.user.create({
    data: {
      email: `abandon-prov-${suffix}@example.com`,
      password: "hash",
      name: "Abandon Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: { userId: providerUser.id, approved: true },
  });
  const customerUser = await prisma.user.create({
    data: {
      email: `abandon-cust-${suffix}@example.com`,
      password: "hash",
      name: "Abandon Customer",
      role: "CUSTOMER",
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: `abandon-admin-${suffix}@example.com`,
      password: "hash",
      name: "Abandon Admin",
      role: "ADMIN",
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `Abandon repay ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "unpaid payfast abandon",
      price: 250,
      customerId: customerUser.id,
      providerId: providerUser.id,
      status: "ACCEPTED",
      meta: {
        refund: {
          pendingRefund: 232.5,
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
      customerId: customerUser.id,
      jobId: job.id,
      totalPending: 232.5,
      recoveredAmount: 0,
      status: "PENDING",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reference: `EFX-AB-${suffix}`,
    },
  });
  await prisma.earning.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      jobId: job.id,
      amount: 232.5,
      type: "debit",
      status: "refund_debt",
    },
  });
  return { providerUser, provider, customerUser, adminUser, job };
}

async function cleanupJobFixtures(prisma, fixtures) {
  if (!fixtures) return;
  await prisma.providerRefundRepayment
    .deleteMany({ where: { providerId: fixtures.provider.id } })
    .catch(() => {});
  await prisma.paymentIntent.deleteMany({ where: { jobId: fixtures.job.id } }).catch(() => {});
  await prisma.job.deleteMany({ where: { id: fixtures.job.id } }).catch(() => {});
  await prisma.refundRecovery.deleteMany({ where: { providerId: fixtures.provider.id } }).catch(() => {});
  await prisma.earning.deleteMany({ where: { providerId: fixtures.provider.id } }).catch(() => {});
  await prisma.provider.delete({ where: { id: fixtures.provider.id } }).catch(() => {});
  await prisma.user
    .deleteMany({
      where: {
        id: {
          in: [fixtures.providerUser.id, fixtures.customerUser.id, fixtures.adminUser.id],
        },
      },
    })
    .catch(() => {});
}

function installGatewayMocks() {
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
      verifyTransaction: async () => ({ valid: true, state: "FAILED", amount: 232.5 }),
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

function installNotifySpy({ latePaidThrows = false } = {}) {
  const notificationEvents = require("../src/services/notificationEvents.service");
  const originals = {
    notifyAdminAbandonedRepaymentLatePaid: notificationEvents.notifyAdminAbandonedRepaymentLatePaid,
    notifyAdminRefundRepaymentSubmitted: notificationEvents.notifyAdminRefundRepaymentSubmitted,
    notifyProviderRepaymentSubmitted: notificationEvents.notifyProviderRepaymentSubmitted,
    notifyProviderRepaymentRejected: notificationEvents.notifyProviderRepaymentRejected,
    notifyCustomerRefundApproved: notificationEvents.notifyCustomerRefundApproved,
  };
  const latePaid = [];
  const customerRefund = [];
  notificationEvents.notifyAdminAbandonedRepaymentLatePaid = async (args) => {
    latePaid.push(args);
    if (latePaidThrows) throw new Error("notify late paid failed");
  };
  notificationEvents.notifyAdminRefundRepaymentSubmitted = async () => {};
  notificationEvents.notifyProviderRepaymentSubmitted = async () => {};
  notificationEvents.notifyProviderRepaymentRejected = async () => {};
  notificationEvents.notifyCustomerRefundApproved = async (args) => {
    customerRefund.push(args);
  };
  return {
    latePaid,
    customerRefund,
    restore() {
      notificationEvents.notifyAdminAbandonedRepaymentLatePaid =
        originals.notifyAdminAbandonedRepaymentLatePaid;
      notificationEvents.notifyAdminRefundRepaymentSubmitted =
        originals.notifyAdminRefundRepaymentSubmitted;
      notificationEvents.notifyProviderRepaymentSubmitted =
        originals.notifyProviderRepaymentSubmitted;
      notificationEvents.notifyProviderRepaymentRejected = originals.notifyProviderRepaymentRejected;
      notificationEvents.notifyCustomerRefundApproved = originals.notifyCustomerRefundApproved;
    },
  };
}

async function abandonPayfast(refundRecovery, fixtures, jobId) {
  const first = await refundRecovery.createProviderRefundRepaymentCheckout(
    fixtures.providerUser.id,
    jobId,
    { provider: "PAYFAST", amount: 232.5 }
  );
  await refundRecovery.abandonUnpaidPayfastRepaymentAttempt(
    fixtures.adminUser.id,
    first.repaymentId,
    {
      adminNote: "Checked PayFast merchant dashboard. No successful payment exists.",
      confirmPayfastMerchantUnchecked: true,
    }
  );
  return first;
}

function assertLateReconLock(err) {
  assert.ok(err instanceof AppError, "expected AppError");
  assert.strictEqual(err.statusCode, 409);
  assert.strictEqual(err.code, "LATE_REPAYMENT_RECONCILIATION_REQUIRED");
}

async function sendLatePaid(webhookService, merchantReference, intentId, amount = 232.5) {
  return webhookService.processWebhookResult("PAYFAST", {
    valid: true,
    merchantReference,
    gatewayTransactionId: `pf-late-${intentId.slice(0, 8)}`,
    state: "PAID",
    amount,
    externalEventId: `late-abandon-${intentId}`,
    raw: { passphrase: "secret-must-not-be-copied", pf_payment_id: `pf-late-${intentId.slice(0, 8)}` },
  });
}

async function debtSnapshot(prisma, providerId, jobId) {
  const recovery = await prisma.refundRecovery.findFirst({
    where: { providerId, jobId },
  });
  const debts = await prisma.earning.findMany({
    where: { providerId, jobId, type: "debit", status: "refund_debt" },
  });
  return {
    recoveredAmount: Number(recovery?.recoveredAmount || 0),
    status: recovery?.status || null,
    debtAmount: debts.reduce((s, d) => s + Number(d.amount), 0),
    debtCount: debts.length,
  };
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const refundRecovery = require("../src/services/refundRecovery.service");
  const webhookService = require("../src/services/payments/webhook.service");
  const fs = require("fs");
  const path = require("path");

  const providerRoutes = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "providerAccount.routes.js"),
    "utf8"
  );
  assert.ok(
    !/abandon-unpaid-payfast|abandonUnpaid|resolve-late-payfast/.test(providerRoutes),
    "provider routes must not expose abandon or late reconciliation"
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fixturesUnlock = await createJobFixtures(prisma, `${suffix}-u`);
  const gwUnlock = installGatewayMocks();
  const notifyUnlock = installNotifySpy();
  try {
    const first = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesUnlock.providerUser.id,
      fixturesUnlock.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    let providerAbandonBlocked = false;
    try {
      await refundRecovery.abandonUnpaidPayfastRepaymentAttempt(
        fixturesUnlock.providerUser.id,
        first.repaymentId,
        {
          adminNote: "Checked PayFast merchant dashboard. No successful payment exists.",
          confirmPayfastMerchantUnchecked: true,
        }
      );
    } catch (e) {
      providerAbandonBlocked = e instanceof AppError && e.statusCode === 403;
    }
    assert.strictEqual(providerAbandonBlocked, true);
    await refundRecovery.abandonUnpaidPayfastRepaymentAttempt(
      fixturesUnlock.adminUser.id,
      first.repaymentId,
      {
        adminNote: "Checked PayFast merchant dashboard. No successful payment exists.",
        confirmPayfastMerchantUnchecked: true,
      }
    );
    const obligation = await refundRecovery.getProviderJobRefundObligation(
      fixturesUnlock.providerUser.id,
      fixturesUnlock.job.id
    );
    assert.strictEqual(obligation.pendingRepayment, null);
    assert.strictEqual(obligation.lateRepaymentReconciliationRequired, false);
    assert.strictEqual(obligation.amountDue, 232.5);

    const paystack = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesUnlock.providerUser.id,
      fixturesUnlock.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(paystack.provider, "PAYSTACK");
    assert.strictEqual(paystack.amount, 232.5);
    const paystackIntent = await prisma.paymentIntent.findUnique({
      where: { id: paystack.intentId },
    });
    assert.strictEqual(Number(paystackIntent.commissionAmount), 0);
    const payload = buildCheckoutInitializePayload(paystackIntent, {
      email: "abandon-prov@example.com",
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "subaccount"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "bearer"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "percentage_charge"));
    assertInitializeRepaymentPayload(payload);
  } finally {
    gwUnlock.restore();
    notifyUnlock.restore();
    await cleanupJobFixtures(prisma, fixturesUnlock);
  }

  const fixturesLate = await createJobFixtures(prisma, `${suffix}-l`);
  const gwLate = installGatewayMocks();
  const notifyLate = installNotifySpy({ latePaidThrows: true });
  try {
    const first = await abandonPayfast(refundRecovery, fixturesLate, fixturesLate.job.id);
    const jobMetaBefore = await prisma.job.findUnique({
      where: { id: fixturesLate.job.id },
      select: { meta: true },
    });
    const debtBefore = await debtSnapshot(prisma, fixturesLate.provider.id, fixturesLate.job.id);
    const intentCountBefore = await prisma.paymentIntent.count({
      where: { jobId: fixturesLate.job.id },
    });
    const repayCountBefore = await prisma.providerRefundRepayment.count({
      where: { providerId: fixturesLate.provider.id },
    });

    const late = await sendLatePaid(webhookService, first.merchantReference, first.intentId);
    assert.ok(!late.httpStatus || late.httpStatus === 200);
    assert.strictEqual(late.result?.abandonedLatePaid, true);

    const intentLate = await prisma.paymentIntent.findUnique({ where: { id: first.intentId } });
    assert.strictEqual(intentLate.state, "CANCELLED");
    assert.strictEqual(intentLate.gatewayPayload.latePaidItnAfterAbandon, true);
    assert.strictEqual(intentLate.gatewayPayload.latePaidItnReconciliationRequired, true);
    assert.strictEqual(intentLate.gatewayPayload.latePaidItnReconciliationResolved, false);

    const debtAfterLate = await debtSnapshot(prisma, fixturesLate.provider.id, fixturesLate.job.id);
    assert.deepStrictEqual(debtAfterLate, debtBefore);
    const jobAfterLate = await prisma.job.findUnique({
      where: { id: fixturesLate.job.id },
      select: { meta: true },
    });
    assert.deepStrictEqual(jobAfterLate.meta, jobMetaBefore.meta);
    assert.strictEqual(notifyLate.customerRefund.length, 0);

    const obligation = await refundRecovery.getProviderJobRefundObligation(
      fixturesLate.providerUser.id,
      fixturesLate.job.id
    );
    assert.strictEqual(obligation.lateRepaymentReconciliationRequired, true);

    const reviews = await refundRecovery.listAdminRefundRepayments({ view: "reviews" });
    const adminRow = reviews.find((r) => r.id === first.repaymentId);
    assert.ok(adminRow, "unresolved late reconciliation must appear in admin reviews");
    assert.strictEqual(adminRow.latePayfastReconciliation?.required, true);
    assert.strictEqual(adminRow.canResolveLatePayfastReconciliation, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(adminRow, "gatewayPayload"));

    let paystackErr;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixturesLate.providerUser.id,
        fixturesLate.job.id,
        { provider: "PAYSTACK", amount: 232.5 }
      );
    } catch (e) {
      paystackErr = e;
    }
    assertLateReconLock(paystackErr);

    let payfastErr;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixturesLate.providerUser.id,
        fixturesLate.job.id,
        { provider: "PAYFAST", amount: 232.5 }
      );
    } catch (e) {
      payfastErr = e;
    }
    assertLateReconLock(payfastErr);

    assert.strictEqual(
      await prisma.paymentIntent.count({ where: { jobId: fixturesLate.job.id } }),
      intentCountBefore
    );
    assert.strictEqual(
      await prisma.providerRefundRepayment.count({ where: { providerId: fixturesLate.provider.id } }),
      repayCountBefore
    );
    assert.strictEqual(
      await prisma.providerRefundRepayment.count({
        where: { providerId: fixturesLate.provider.id, status: "SUBMITTED" },
      }),
      0
    );

    let providerResolveBlocked = false;
    try {
      await refundRecovery.resolveLateAbandonedPayfastReconciliation(
        fixturesLate.providerUser.id,
        first.repaymentId,
        {
          resolution: "EXTERNAL_REFUND_CONFIRMED",
          confirmExternalRefund: true,
          adminNote: "Refunded late PayFast payment in merchant dashboard.",
        }
      );
    } catch (e) {
      providerResolveBlocked = e instanceof AppError && e.statusCode === 403;
    }
    assert.strictEqual(providerResolveBlocked, true, "provider cannot resolve reconciliation");

    await refundRecovery.resolveLateAbandonedPayfastReconciliation(
      fixturesLate.adminUser.id,
      first.repaymentId,
      {
        resolution: "EXTERNAL_REFUND_CONFIRMED",
        confirmExternalRefund: true,
        adminNote: "Refunded late PayFast payment in merchant dashboard.",
      }
    );
    const intentResolved = await prisma.paymentIntent.findUnique({ where: { id: first.intentId } });
    assert.strictEqual(intentResolved.gatewayPayload.latePaidItnReconciliationResolved, true);
    const debtAfterResolve = await debtSnapshot(prisma, fixturesLate.provider.id, fixturesLate.job.id);
    assert.deepStrictEqual(debtAfterResolve, debtBefore);

    const afterResolve = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesLate.providerUser.id,
      fixturesLate.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(afterResolve.provider, "PAYSTACK");
    const resolvedPaystack = await prisma.paymentIntent.findUnique({
      where: { id: afterResolve.intentId },
    });
    assert.strictEqual(Number(resolvedPaystack.commissionAmount), 0);
    const resolvedPayload = buildCheckoutInitializePayload(resolvedPaystack, {
      email: "abandon-prov@example.com",
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(resolvedPayload, "subaccount"));
    assertInitializeRepaymentPayload(resolvedPayload);
  } finally {
    gwLate.restore();
    notifyLate.restore();
    await cleanupJobFixtures(prisma, fixturesLate);
  }

  const fixturesContinue = await createJobFixtures(prisma, `${suffix}-c`);
  const gwContinue = installGatewayMocks();
  const notifyContinue = installNotifySpy();
  try {
    const first = await abandonPayfast(refundRecovery, fixturesContinue, fixturesContinue.job.id);
    const replacement = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesContinue.providerUser.id,
      fixturesContinue.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(replacement.provider, "PAYSTACK");
    await sendLatePaid(webhookService, first.merchantReference, first.intentId);
    const continueCountBefore = await prisma.paymentIntent.count({
      where: { jobId: fixturesContinue.job.id },
    });
    let continueErr;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixturesContinue.providerUser.id,
        fixturesContinue.job.id,
        { provider: "PAYSTACK", amount: 232.5 }
      );
    } catch (e) {
      continueErr = e;
    }
    assertLateReconLock(continueErr);
    assert.strictEqual(
      await prisma.paymentIntent.count({ where: { jobId: fixturesContinue.job.id } }),
      continueCountBefore
    );
  } finally {
    gwContinue.restore();
    notifyContinue.restore();
    await cleanupJobFixtures(prisma, fixturesContinue);
  }

  const fixturesPaid = await createJobFixtures(prisma, `${suffix}-p`);
  const gwPaid = installGatewayMocks();
  const notifyPaid = installNotifySpy();
  try {
    const first = await abandonPayfast(refundRecovery, fixturesPaid, fixturesPaid.job.id);
    const replacement = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesPaid.providerUser.id,
      fixturesPaid.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    await prisma.paymentIntent.update({
      where: { id: replacement.intentId },
      data: {
        state: "PAID",
        paidAt: new Date(),
        gatewayTransactionId: "ps-replacement-paid",
      },
    });
    const debtBefore = await debtSnapshot(prisma, fixturesPaid.provider.id, fixturesPaid.job.id);
    await sendLatePaid(webhookService, first.merchantReference, first.intentId);
    const abandonedIntent = await prisma.paymentIntent.findUnique({ where: { id: first.intentId } });
    assert.strictEqual(abandonedIntent.state, "CANCELLED");
    assert.strictEqual(abandonedIntent.gatewayPayload.latePaidItnReconciliationResolved, false);
    const replacementIntent = await prisma.paymentIntent.findUnique({
      where: { id: replacement.intentId },
    });
    assert.strictEqual(replacementIntent.state, "PAID");
    assert.deepStrictEqual(
      await debtSnapshot(prisma, fixturesPaid.provider.id, fixturesPaid.job.id),
      debtBefore
    );

    let useLateBlocked = false;
    try {
      await refundRecovery.resolveLateAbandonedPayfastReconciliation(
        fixturesPaid.adminUser.id,
        first.repaymentId,
        {
          resolution: "USE_LATE_PAYMENT",
          confirmExternalRefund: true,
          adminNote: "Tried to apply the late PayFast payment as repayment.",
        }
      );
    } catch (e) {
      useLateBlocked = e instanceof AppError && e.statusCode === 400;
    }
    assert.strictEqual(useLateBlocked, true, "USE_LATE_PAYMENT must fail closed");

    const paidContinue = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixturesPaid.providerUser.id,
      fixturesPaid.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(paidContinue.gatewayPaymentVerified, true);
    assert.strictEqual(paidContinue.intentId, replacement.intentId);
  } finally {
    gwPaid.restore();
    notifyPaid.restore();
    await cleanupJobFixtures(prisma, fixturesPaid);
  }

  console.log("refundRepayment.abandon.test.js: OK (DB integration)");
}

async function main() {
  testHelpers();
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
    console.log("refundRepayment.abandon.test.js: skipped DB integration (no DATABASE_URL)");
    return;
  }
  await runDbIntegrationTests();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
