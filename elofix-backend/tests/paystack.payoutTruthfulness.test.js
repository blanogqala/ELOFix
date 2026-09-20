/**
 * Paystack fee + payout status truthfulness (no money-movement changes).
 * Run: node tests/paystack.payoutTruthfulness.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const paystack = require("../src/services/payments/paystack.gateway");
const { payoutColumnsForPaidIntent } = require("../src/services/payments/payoutTransparency.util");

const ACCT_OLD = "ACCT_TRUTH_OLD";
const ACCT_NEW = "ACCT_TRUTH_NEW";

async function seedIntent(suffix, extras = {}) {
  const customer = await prisma.user.create({
    data: {
      email: `truth.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `truth.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      title: "Truth job",
      customerId: customer.id,
      providerId: providerUser.id,
      category: "tiling",
      description: "test",
      status: "ACCEPTED",
      price: new Prisma.Decimal("50.00"),
      measurements: {},
      materials: [],
      images: [],
    },
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-TRUTH-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "FULL_UPFRONT",
      userId: customer.id,
      jobId: job.id,
      recipientUserId: providerUser.id,
      amount: new Prisma.Decimal("50.00"),
      commissionAmount: new Prisma.Decimal("3.50"),
      recipientAmount: new Prisma.Decimal("46.50"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      payoutSettlementStatus: extras.payoutSettlementStatus || "PROCESSING",
      payoutSettlementId: extras.payoutSettlementId || null,
      processorFeeAmount: extras.processorFeeAmount === undefined ? null : extras.processorFeeAmount,
      gatewayPayload: extras.gatewayPayload || {
        subaccount: extras.subaccount || ACCT_OLD,
        fees: 282,
        fees_split: null,
        status: "success",
        gateway_response: "Approved",
        message: "Approved",
      },
    },
  });
  return { customer, providerUser, job, intent };
}

async function cleanup(fix, extraSettlementIds = []) {
  if (!fix) return;
  if (fix.intent?.id) {
    await prisma.paymentIntent
      .update({ where: { id: fix.intent.id }, data: { payoutSettlementId: null } })
      .catch(() => {});
    await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
  }
  if (extraSettlementIds.length) {
    const settlements = await prisma.gatewayPayoutSettlement.findMany({
      where: { id: { in: extraSettlementIds } },
      select: { id: true },
    });
    const ids = settlements.map((s) => s.id);
    if (ids.length) {
      await prisma.gatewayPayoutSettlementEvent.deleteMany({ where: { settlementId: { in: ids } } }).catch(() => {});
      await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { settlementId: { in: ids } } }).catch(() => {});
      await prisma.gatewayPayoutSettlement.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    }
  }
  if (fix.intent?.id) {
    await prisma.paymentIntent.deleteMany({ where: { id: fix.intent.id } }).catch(() => {});
  }
  if (fix.job?.id) await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  if (fix.customer && fix.providerUser) {
    await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.providerUser.id] } } }).catch(() => {});
  }
}

async function run() {
  rec.resetProviderPayoutRefreshThrottleForTests();
  const suffix = randomUUID().slice(0, 8);
  const repairable = await seedIntent(`${suffix}a`, { payoutSettlementStatus: "PROCESSING", payoutSettlementId: null });
  const settlement = await prisma.gatewayPayoutSettlement.create({
    data: {
      id: randomUUID(),
      gateway: "PAYSTACK",
      externalSettlementId: `truth-keep-${suffix}`,
      recipientType: "PROVIDER",
      recipientUserId: repairable.providerUser.id,
      subaccountCode: ACCT_OLD,
      status: "PROCESSING",
      currency: "ZAR",
    },
  });
  const keep = await seedIntent(`${suffix}b`, {
    payoutSettlementStatus: "PROCESSING",
    payoutSettlementId: settlement.id,
    processorFeeAmount: new Prisma.Decimal("2.82"),
  });

  const origVerify = paystack.verifyTransaction;
  const origList = paystack.listSettlements;
  const origTx = paystack.getSettlementTransactions;
  const origExport = paystack.getSettlementTransactionsViaExport;
  const origConfigured = paystack.isConfigured;
  const origResolve = paystack.resolvePaystackSubaccountId;
  let verifyCalls = 0;
  paystack.isConfigured = () => true;
  paystack.resolvePaystackSubaccountId = async (code) => {
    if (String(code).toUpperCase() === ACCT_OLD.toUpperCase()) return 424242;
    return null;
  };
  paystack.verifyTransaction = async (reference) => {
    verifyCalls += 1;
    return {
      valid: true,
      state: "PAID",
      merchantReference: reference,
      raw: {
        status: "success",
        gateway_response: "Approved",
        message: "Approved",
        fees: 282,
        fees_split: null,
      },
    };
  };
  paystack.listSettlements = async () => ({ settlements: [] });
  paystack.getSettlementTransactions = async () => ({ transactions: [] });
  paystack.getSettlementTransactionsViaExport = async () => ({ transactions: [] });

  try {
    const repaired = await rec.repairFalseChargeTimeProcessing([repairable.intent, keep.intent]);
    assert.deepStrictEqual(repaired, [repairable.intent.id]);
    const repairedRow = await prisma.paymentIntent.findUnique({ where: { id: repairable.intent.id } });
    const keptRow = await prisma.paymentIntent.findUnique({ where: { id: keep.intent.id } });
    assert.strictEqual(repairedRow.payoutSettlementStatus, "PENDING");
    assert.strictEqual(keptRow.payoutSettlementStatus, "PROCESSING");
    assert.strictEqual(keptRow.payoutSettlementId, settlement.id);

    const feeBackfill = await rec.backfillProcessorFeeFromStoredEvidence([
      { ...repairedRow, kind: "LABOR", provider: "PAYSTACK", state: "PAID" },
    ]);
    assert.ok(feeBackfill.includes(repairedRow.id));
    const withFee = await prisma.paymentIntent.findUnique({ where: { id: repairedRow.id } });
    assert.strictEqual(Number(withFee.processorFeeAmount), 2.82);
    assert.strictEqual(Number(withFee.amount), 50);
    assert.strictEqual(Number(withFee.commissionAmount), 3.5);
    assert.strictEqual(Number(withFee.recipientAmount), 46.5);
    assert.strictEqual(withFee.payoutSettlementStatus, "PENDING");

    rec.resetProviderPayoutRefreshThrottleForTests();
    await rec.refreshProviderPaystackPayoutObservability({
      providerUserId: repairable.providerUser.id,
      intents: [withFee],
    });
    const afterRefresh = await prisma.paymentIntent.findUnique({ where: { id: withFee.id } });
    assert.notStrictEqual(afterRefresh.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(Number(afterRefresh.amount), 50);
    assert.strictEqual(Number(afterRefresh.commissionAmount), 3.5);
    assert.strictEqual(Number(afterRefresh.recipientAmount), 46.5);

    const verifyBefore = verifyCalls;
    await rec.refreshProviderPaystackPayoutObservability({
      providerUserId: repairable.providerUser.id,
      intents: [afterRefresh],
    });
    assert.strictEqual(verifyCalls, verifyBefore, "throttled refresh must not re-verify");

    rec.resetProviderPayoutRefreshThrottleForTests();
    paystack.listSettlements = async () => {
      throw new Error("paystack down");
    };
    await rec.refreshProviderPaystackPayoutObservability({
      providerUserId: repairable.providerUser.id,
      intents: [afterRefresh],
    });
    const afterDown = await prisma.paymentIntent.findUnique({ where: { id: afterRefresh.id } });
    assert.strictEqual(Number(afterDown.recipientAmount), 46.5);

    const chargeColumns = payoutColumnsForPaidIntent(
      { kind: "LABOR", provider: "PAYSTACK", recipientAmount: 46.5, amount: 50, commissionAmount: 3.5 },
      { status: "success", gateway_response: "Approved", message: "Approved", fees: 282 }
    );
    assert.strictEqual(chargeColumns.payoutSettlementStatus, "PENDING");

    const mainIgnored = rec.resolveTrustedSubaccountScope({ id: 1, status: "success" }, { scopedSubaccount: "none" });
    assert.strictEqual(mainIgnored.ok, false);
    assert.strictEqual(mainIgnored.reason, "main_account_settlement_ignored");

    const notifyRetired = await rec.notifyChargeTimeProcessing("anything");
    assert.strictEqual(notifyRetired.skipped, true);

    rec.resetProviderPayoutRefreshThrottleForTests();
    let listed = [];
    let resolved = [];
    paystack.resolvePaystackSubaccountId = async (code) => {
      resolved.push(String(code));
      if (String(code).toUpperCase() === ACCT_OLD.toUpperCase()) return 424242;
      return null;
    };
    paystack.listSettlements = async (opts = {}) => {
      listed.push(opts.subaccount);
      return { settlements: [] };
    };
    const mixed = await seedIntent(`${suffix}c`, {
      payoutSettlementStatus: "PENDING",
      subaccount: ACCT_OLD,
      gatewayPayload: { subaccount: ACCT_OLD, fees: 282, fees_split: null },
    });
    await rec.refreshProviderPaystackPayoutObservability({
      providerUserId: mixed.providerUser.id,
      intents: [{ ...mixed.intent, kind: "LABOR", provider: "PAYSTACK", state: "PAID" }],
    });
    assert.ok(resolved.some((code) => String(code).toUpperCase() === ACCT_OLD.toUpperCase()));
    assert.ok(listed.every((id) => Number(id) === 424242));
    assert.ok(!listed.includes(ACCT_NEW));
    assert.ok(!listed.includes(ACCT_OLD));
    await cleanup(mixed);

    rec.resetProviderPayoutRefreshThrottleForTests();
    listed = [];
    paystack.resolvePaystackSubaccountId = async () => null;
    paystack.listSettlements = async (opts = {}) => {
      listed.push(opts.subaccount);
      return { settlements: [] };
    };
    const unresolved = await seedIntent(`${suffix}d`, {
      payoutSettlementStatus: "PENDING",
      subaccount: ACCT_OLD,
      gatewayPayload: { subaccount: ACCT_OLD, fees: 282, fees_split: null },
    });
    await rec.refreshProviderPaystackPayoutObservability({
      providerUserId: unresolved.providerUser.id,
      intents: [{ ...unresolved.intent, kind: "LABOR", provider: "PAYSTACK", state: "PAID" }],
    });
    assert.deepStrictEqual(listed, []);
    await cleanup(unresolved);
    paystack.resolvePaystackSubaccountId = origResolve;

    console.log("paystack.payoutTruthfulness.test.js: all passed");
  } finally {
    paystack.verifyTransaction = origVerify;
    paystack.listSettlements = origList;
    paystack.getSettlementTransactions = origTx;
    paystack.getSettlementTransactionsViaExport = origExport;
    paystack.isConfigured = origConfigured;
    paystack.resolvePaystackSubaccountId = origResolve;
    rec.resetProviderPayoutRefreshThrottleForTests();
    await cleanup(keep, [settlement.id]);
    await cleanup(repairable);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
