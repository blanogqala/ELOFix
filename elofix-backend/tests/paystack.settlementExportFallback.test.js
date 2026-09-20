/**
 * Empty settlement-transactions list falls back to transaction export membership.
 * Run: node tests/paystack.settlementExportFallback.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const paystack = require("../src/services/payments/paystack.gateway");

const ACCT = "ACCT_EXPORT_FB";

async function seedIntent(suffix, extras = {}) {
  const customer = await prisma.user.create({
    data: {
      email: `exfb.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `exfb.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      title: "Export fallback",
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
      merchantReference: `EF-EXFB-${suffix}`.toUpperCase(),
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
      payoutSettlementStatus: "PENDING",
      processorFeeAmount:
        extras.processorFeeAmount === undefined ? new Prisma.Decimal("2.82") : extras.processorFeeAmount,
      expectedBankSettlementAmount:
        extras.expectedBankSettlementAmount === undefined
          ? new Prisma.Decimal("43.68")
          : extras.expectedBankSettlementAmount,
      gatewayPayload: extras.gatewayPayload || {
        subaccount: ACCT,
        bearer: "subaccount",
        fees: 282,
        fees_split: { paystack: 282 },
      },
    },
  });
  return { customer, providerUser, job, intent };
}

async function cleanup(fix, settlementIds = []) {
  if (!fix) return;
  if (fix.intent?.id) {
    await prisma.paymentIntent
      .update({ where: { id: fix.intent.id }, data: { payoutSettlementId: null } })
      .catch(() => {});
    await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
  }
  if (settlementIds.length) {
    await prisma.gatewayPayoutSettlementEvent.deleteMany({ where: { settlementId: { in: settlementIds } } }).catch(() => {});
    await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { settlementId: { in: settlementIds } } }).catch(() => {});
    await prisma.gatewayPayoutSettlement.deleteMany({ where: { id: { in: settlementIds } } }).catch(() => {});
  }
  if (fix.intent?.id) await prisma.paymentIntent.deleteMany({ where: { id: fix.intent.id } }).catch(() => {});
  if (fix.job?.id) await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  if (fix.customer && fix.providerUser) {
    await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.providerUser.id] } } }).catch(() => {});
  }
}

async function run() {
  const origTx = paystack.getSettlementTransactions;
  const origExport = paystack.getSettlementTransactionsViaExport;
  const origAuth = paystack.getAuthoritativeSettlementTransactions;
  const match = await seedIntent(randomUUID().slice(0, 8));
  const miss = await seedIntent(randomUUID().slice(0, 8));
  const empty = await seedIntent(randomUUID().slice(0, 8));
  const noFee = await seedIntent(randomUUID().slice(0, 8), {
    processorFeeAmount: null,
    expectedBankSettlementAmount: null,
    gatewayPayload: { subaccount: ACCT, bearer: "subaccount" },
  });
  const linked = [];
  try {
    paystack.getSettlementTransactions = async () => ({ transactions: [] });
    paystack.getSettlementTransactionsViaExport = async (settlementId) => {
      if (String(settlementId) === "88001991") {
        return { transactions: [{ reference: match.intent.merchantReference, status: "success" }] };
      }
      if (String(settlementId) === "88001992") {
        return { transactions: [{ reference: "EF-NOT-THIS-ONE", status: "success" }] };
      }
      if (String(settlementId) === "88001994") {
        return { transactions: [{ reference: noFee.intent.merchantReference, status: "success" }] };
      }
      return { transactions: [] };
    };

    const applied = await rec.applyPaystackSettlementRow(
      { id: 88001991, status: "success", currency: "ZAR", settlement_date: "2026-09-15" },
      { scopedSubaccount: ACCT, source: "test", notify: false }
    );
    assert.strictEqual(applied.skipped, false);
    assert.strictEqual(applied.status, "SETTLED");
    const settled = await prisma.paymentIntent.findUnique({ where: { id: match.intent.id } });
    assert.strictEqual(settled.payoutSettlementStatus, "SETTLED");
    assert.ok(settled.payoutSettlementId);
    assert.strictEqual(Number(settled.amount), 50);
    assert.strictEqual(Number(settled.commissionAmount), 3.5);
    assert.strictEqual(Number(settled.recipientAmount), 46.5);
    assert.strictEqual(Number(settled.processorFeeAmount), 2.82);
    linked.push(settled.payoutSettlementId);

    const skippedWrongRef = await rec.applyPaystackSettlementRow(
      { id: 88001992, status: "success", currency: "ZAR", settlement_date: "2026-09-15" },
      { scopedSubaccount: ACCT, source: "test", notify: false }
    );
    assert.strictEqual(skippedWrongRef.skipped, true);
    const missFresh = await prisma.paymentIntent.findUnique({ where: { id: miss.intent.id } });
    assert.strictEqual(missFresh.payoutSettlementStatus, "PENDING");
    assert.strictEqual(missFresh.payoutSettlementId, null);

    const skippedEmpty = await rec.applyPaystackSettlementRow(
      { id: 88001993, status: "success", currency: "ZAR", settlement_date: "2026-09-15" },
      { scopedSubaccount: ACCT, source: "test", notify: false }
    );
    assert.strictEqual(skippedEmpty.skipped, true);
    assert.strictEqual(skippedEmpty.reason, "no_transactions_and_no_amount");
    const emptyFresh = await prisma.paymentIntent.findUnique({ where: { id: empty.intent.id } });
    assert.strictEqual(emptyFresh.payoutSettlementStatus, "PENDING");

    const appliedNoFee = await rec.applyPaystackSettlementRow(
      { id: 88001994, status: "success", currency: "ZAR", settlement_date: "2026-09-15" },
      { scopedSubaccount: ACCT, source: "test", notify: false }
    );
    assert.strictEqual(appliedNoFee.skipped, false);
    assert.strictEqual(appliedNoFee.status, "SETTLED");
    const noFeeFresh = await prisma.paymentIntent.findUnique({ where: { id: noFee.intent.id } });
    assert.strictEqual(noFeeFresh.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(noFeeFresh.processorFeeAmount, null);
    linked.push(noFeeFresh.payoutSettlementId);

    const mainIgnored = rec.resolveTrustedSubaccountScope({ id: 1, status: "success" }, { scopedSubaccount: "none" });
    assert.strictEqual(mainIgnored.ok, false);

    console.log("paystack.settlementExportFallback.test.js: all passed");
  } finally {
    paystack.getSettlementTransactions = origTx;
    paystack.getSettlementTransactionsViaExport = origExport;
    paystack.getAuthoritativeSettlementTransactions = origAuth;
    await cleanup(match, linked);
    await cleanup(miss);
    await cleanup(empty);
    await cleanup(noFee);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
