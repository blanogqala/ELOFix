require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const paystack = require("../src/services/payments/paystack.gateway");

async function seedTwoIntents(suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `d3.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `d3.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      title: "Tiling",
      customerId: customer.id,
      providerId: providerUser.id,
      category: "tiling",
      description: "test",
      status: "ACCEPTED",
      price: new Prisma.Decimal("100.00"),
      measurements: {},
      materials: [],
      images: [],
    },
  });
  const a = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-D3A-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: customer.id,
      jobId: job.id,
      recipientUserId: providerUser.id,
      amount: new Prisma.Decimal("50.00"),
      commissionAmount: new Prisma.Decimal("3.50"),
      recipientAmount: new Prisma.Decimal("46.50"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      payoutSettlementStatus: "PROCESSING",
    },
  });
  const b = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-D3B-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "COMPLETION",
      userId: customer.id,
      jobId: job.id,
      recipientUserId: providerUser.id,
      amount: new Prisma.Decimal("50.00"),
      commissionAmount: new Prisma.Decimal("3.50"),
      recipientAmount: new Prisma.Decimal("46.50"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      payoutSettlementStatus: "PROCESSING",
    },
  });
  return { customer, providerUser, job, a, b };
}

async function cleanup(fix) {
  if (!fix) return;
  await prisma.gatewayPayoutSettlementItem.deleteMany({
    where: { paymentIntentId: { in: [fix.a.id, fix.b.id] } },
  }).catch(() => {});
  await prisma.paymentIntent.deleteMany({ where: { id: { in: [fix.a.id, fix.b.id] } } }).catch(() => {});
  await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.providerUser.id] } } }).catch(() => {});
}

async function run() {
  const suffix = randomUUID().slice(0, 8);
  const fix = await seedTwoIntents(suffix);
  const origList = paystack.listSettlements;
  const origTx = paystack.getSettlementTransactions;
  paystack.listSettlements = async () => ({ settlements: [] });
  paystack.getSettlementTransactions = async () => ({
    transactions: [
      { reference: fix.a.merchantReference, fees_split: { paystack: 282 }, bearer: "subaccount" },
      { reference: fix.b.merchantReference, fees_split: { paystack: 282 }, bearer: "subaccount" },
    ],
  });
  try {
    const first = await rec.applyPaystackSettlementRow(
      {
        id: 991122,
        status: "success",
        currency: "ZAR",
        settlement_date: "2026-09-15T00:00:00.000Z",
        subaccount: "ACCT_TEST",
      },
      { source: "reconcile_job", notify: false }
    );
    assert.strictEqual(first.skipped, false);
    assert.strictEqual(first.linked, 2);
    assert.strictEqual(first.status, "SETTLED");

    const second = await rec.applyPaystackSettlementRow(
      {
        id: 991122,
        status: "success",
        currency: "ZAR",
        settlement_date: "2026-09-15T00:00:00.000Z",
        subaccount: "ACCT_TEST",
      },
      { source: "reconcile_job", notify: false }
    );
    assert.strictEqual(second.settlementId, first.settlementId);
    assert.strictEqual(second.linked, 2);

    const count = await prisma.gatewayPayoutSettlement.count({
      where: { gateway: "PAYSTACK", externalSettlementId: "991122" },
    });
    assert.strictEqual(count, 1);

    const a = await prisma.paymentIntent.findUnique({ where: { id: fix.a.id } });
    assert.strictEqual(a.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(Number(a.commissionAmount), 3.5);
    assert.strictEqual(Number(a.recipientAmount), 46.5);
    assert.strictEqual(Number(a.processorFeeAmount), 2.82);
    assert.strictEqual(Number(a.expectedBankSettlementAmount), 43.68);

    const failed = await rec.applyPaystackSettlementRow(
      { id: 991122, status: "mystery-status", currency: "ZAR" },
      { notify: false }
    );
    assert.strictEqual(failed.skipped, true);

    console.log("paystack.settlementReconcile.test.js: all passed");
  } finally {
    paystack.listSettlements = origList;
    paystack.getSettlementTransactions = origTx;
    const settlements = await prisma.gatewayPayoutSettlement.findMany({
      where: { externalSettlementId: "991122" },
      select: { id: true },
    });
    const ids = settlements.map((s) => s.id);
    if (ids.length) {
      await prisma.gatewayPayoutSettlementEvent.deleteMany({ where: { settlementId: { in: ids } } }).catch(() => {});
      await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { settlementId: { in: ids } } }).catch(() => {});
      await prisma.gatewayPayoutSettlement.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    }
    await cleanup(fix);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
