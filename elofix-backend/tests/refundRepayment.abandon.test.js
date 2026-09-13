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

function installNotifySpy() {
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
    !/abandon-unpaid-payfast|abandonUnpaid/.test(providerRoutes),
    "provider routes must not expose abandon"
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fixtures = await createJobFixtures(prisma, suffix);
  const gw = installGatewayMocks();
  const notify = installNotifySpy();

  try {
    const first = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixtures.providerUser.id,
      fixtures.job.id,
      { provider: "PAYFAST", amount: 232.5 }
    );
    assert.strictEqual(first.provider, "PAYFAST");
    const originalRef = first.merchantReference;

    let switchBlocked = false;
    try {
      await refundRecovery.createProviderRefundRepaymentCheckout(
        fixtures.providerUser.id,
        fixtures.job.id,
        { provider: "PAYSTACK", amount: 232.5 }
      );
    } catch (e) {
      switchBlocked = e instanceof AppError && e.statusCode === 409;
    }
    assert.strictEqual(switchBlocked, true, "unresolved PayFast keeps Paystack locked");

    let providerAbandonBlocked = false;
    try {
      await refundRecovery.abandonUnpaidPayfastRepaymentAttempt(
        fixtures.providerUser.id,
        first.repaymentId,
        {
          adminNote: "Checked PayFast merchant dashboard. No successful payment exists.",
          confirmPayfastMerchantUnchecked: true,
        }
      );
    } catch (e) {
      providerAbandonBlocked = e instanceof AppError && e.statusCode === 403;
    }
    assert.strictEqual(providerAbandonBlocked, true, "provider cannot abandon its own attempt");

    await prisma.paymentIntent.update({
      where: { id: first.intentId },
      data: {
        state: "PAID",
        paidAt: new Date(),
        gatewayTransactionId: "pf-paid-block",
      },
    });
    let paidBlocked = false;
    try {
      await refundRecovery.abandonUnpaidPayfastRepaymentAttempt(
        fixtures.adminUser.id,
        first.repaymentId,
        {
          adminNote: "Checked PayFast merchant dashboard. No successful payment exists.",
          confirmPayfastMerchantUnchecked: true,
        }
      );
    } catch (e) {
      paidBlocked = e instanceof AppError && e.statusCode === 409;
    }
    assert.strictEqual(paidBlocked, true, "admin cannot abandon a PAID intent");

    await prisma.paymentIntent.update({
      where: { id: first.intentId },
      data: { state: "PENDING", paidAt: null, gatewayTransactionId: null },
    });

    let rejectBlocked = false;
    try {
      await refundRecovery.rejectAdminRefundRepayment(fixtures.adminUser.id, first.repaymentId, {
        adminNote: "Payment not verified",
      });
    } catch (e) {
      rejectBlocked = e instanceof AppError && e.statusCode === 400;
    }
    assert.strictEqual(rejectBlocked, true, "ordinary reject must not abandon unpaid PayFast");

    const jobMetaBefore = await prisma.job.findUnique({
      where: { id: fixtures.job.id },
      select: { meta: true },
    });
    const debtBefore = await debtSnapshot(prisma, fixtures.provider.id, fixtures.job.id);

    const abandoned = await refundRecovery.abandonUnpaidPayfastRepaymentAttempt(
      fixtures.adminUser.id,
      first.repaymentId,
      {
        adminNote: "Checked PayFast merchant dashboard. No successful payment exists.",
        confirmPayfastMerchantUnchecked: true,
      }
    );
    assert.strictEqual(abandoned.abandoned, true);
    assert.strictEqual(abandoned.status, "REJECTED");
    assert.strictEqual(abandoned.paymentIntentState, "CANCELLED");
    assert.strictEqual(abandoned.merchantReference, originalRef);

    const repaymentAfter = await prisma.providerRefundRepayment.findUnique({
      where: { id: first.repaymentId },
    });
    const intentAfter = await prisma.paymentIntent.findUnique({ where: { id: first.intentId } });
    assert.strictEqual(repaymentAfter.status, "REJECTED");
    assert.strictEqual(intentAfter.state, "CANCELLED");
    assert.strictEqual(intentAfter.merchantReference, originalRef);
    assert.strictEqual(intentAfter.gatewayPayload.repaymentAttemptAbandoned, true);
    assert.ok(intentAfter.gatewayPayload.repaymentAttemptAbandonedAt);
    assert.strictEqual(intentAfter.gatewayPayload.repaymentAttemptAbandonedBy, fixtures.adminUser.id);
    assert.ok(intentAfter.gatewayPayload.repaymentAttemptAbandonReason);

    const debtAfterAbandon = await debtSnapshot(prisma, fixtures.provider.id, fixtures.job.id);
    assert.deepStrictEqual(debtAfterAbandon, debtBefore);
    const jobMetaAfterAbandon = await prisma.job.findUnique({
      where: { id: fixtures.job.id },
      select: { meta: true },
    });
    assert.deepStrictEqual(jobMetaAfterAbandon.meta, jobMetaBefore.meta);
    assert.strictEqual(notify.customerRefund.length, 0, "abandonment must not start customer refund");

    const obligation = await refundRecovery.getProviderJobRefundObligation(
      fixtures.providerUser.id,
      fixtures.job.id
    );
    assert.strictEqual(obligation.pendingRepayment, null);
    assert.strictEqual(obligation.amountDue, 232.5);

    const late = await webhookService.processWebhookResult("PAYFAST", {
      valid: true,
      merchantReference: originalRef,
      gatewayTransactionId: "pf-late-after-abandon",
      state: "PAID",
      amount: 232.5,
      externalEventId: `late-abandon-${first.intentId}`,
      raw: { passphrase: "secret-must-not-be-copied", pf_payment_id: "pf-late-after-abandon" },
    });
    assert.ok(!late.httpStatus || late.httpStatus === 200);
    assert.strictEqual(late.result?.abandonedLatePaid, true);
    assert.strictEqual(late.result?.latePaymentReconciliationRequired, true);

    const intentLate = await prisma.paymentIntent.findUnique({ where: { id: first.intentId } });
    assert.strictEqual(intentLate.state, "CANCELLED");
    assert.strictEqual(intentLate.merchantReference, originalRef);
    assert.strictEqual(intentLate.gatewayPayload.latePaidItnAfterAbandon, true);
    assert.strictEqual(intentLate.gatewayPayload.latePaidItnReconciliationRequired, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(intentLate.gatewayPayload, "passphrase"));

    const debtAfterLate = await debtSnapshot(prisma, fixtures.provider.id, fixtures.job.id);
    assert.deepStrictEqual(debtAfterLate, debtBefore);
    const jobAfterLate = await prisma.job.findUnique({
      where: { id: fixtures.job.id },
      select: { meta: true },
    });
    assert.deepStrictEqual(jobAfterLate.meta, jobMetaBefore.meta);
    assert.ok(notify.latePaid.length >= 1, "late PAID ITN must alert admin for manual reconciliation");
    assert.strictEqual(notify.customerRefund.length, 0);

    const submittedAfterLate = await prisma.providerRefundRepayment.count({
      where: { providerId: fixtures.provider.id, status: "SUBMITTED" },
    });
    assert.strictEqual(submittedAfterLate, 0, "late ITN must not attach an active repayment");

    const paystack = await refundRecovery.createProviderRefundRepaymentCheckout(
      fixtures.providerUser.id,
      fixtures.job.id,
      { provider: "PAYSTACK", amount: 232.5 }
    );
    assert.strictEqual(paystack.provider, "PAYSTACK");
    assert.notStrictEqual(paystack.intentId, first.intentId);
    assert.notStrictEqual(paystack.merchantReference, originalRef);
    assert.strictEqual(paystack.amount, 232.5);

    const paystackIntent = await prisma.paymentIntent.findUnique({
      where: { id: paystack.intentId },
    });
    assert.strictEqual(String(paystackIntent.kind), "PROVIDER_REFUND_REPAYMENT");
    assert.strictEqual(Number(paystackIntent.commissionAmount), 0);
    const payload = buildCheckoutInitializePayload(paystackIntent, {
      email: "abandon-prov@example.com",
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "subaccount"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "bearer"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "percentage_charge"));
    assertInitializeRepaymentPayload(payload);
  } finally {
    gw.restore();
    notify.restore();
    await cleanupJobFixtures(prisma, fixtures);
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
