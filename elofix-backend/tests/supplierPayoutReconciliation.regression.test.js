/**
 * Supplier payout reconciliation truth.
 * Charge success is not settlement Success. Only Paystack Settlement API
 * status=success may persist payoutSettlementStatus=SETTLED.
 *
 * Run: node tests/supplierPayoutReconciliation.regression.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const paystack = require("../src/services/payments/paystack.gateway");
const escrowSettlement = require("../src/services/payments/escrowSettlement.service");
const branchSettlementService = require("../src/services/branchSettlement.service");
const { splitCommission, computeExpectedBankSettlement, toCents } = require("../src/services/payments/money.util");
const { payoutColumnsForPaidIntent, mapPaystackSettlementApiStatus } = require("../src/services/payments/payoutTransparency.util");
const { resolveSupplierRecipientGrossMajor } = require("../src/services/payments/supplierPayoutAmounts.util");
const { mapPayoutStatusToSupplierSettlementUi } = require("../src/utils/supplierSettlementPresentation.util");

function dec(n) {
  return new Prisma.Decimal(String(Number(n).toFixed(2)));
}

function payload(subaccount, extras = {}) {
  return {
    subaccount,
    bearer: "subaccount",
    fees_split: { paystack: extras.feeCents != null ? extras.feeCents : 282 },
    fees: extras.feeCents != null ? extras.feeCents : 282,
    status: "success",
    gateway_response: "Approved",
    ...extras.meta,
  };
}

async function wipeSettlements(externalIds) {
  const settlements = await prisma.gatewayPayoutSettlement.findMany({
    where: { gateway: "PAYSTACK", externalSettlementId: { in: externalIds.map(String) } },
    select: { id: true },
  });
  const ids = settlements.map((s) => s.id);
  if (!ids.length) return;
  await prisma.gatewayPayoutSettlementEvent.deleteMany({ where: { settlementId: { in: ids } } }).catch(() => {});
  await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { settlementId: { in: ids } } }).catch(() => {});
  await prisma.gatewayPayoutSettlement.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
}

async function seedActors(suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `spr.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `spr.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `spr.sup.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { userId: supplierUser.id, name: `SPR Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { id: randomUUID(), supplierId: supplier.id, name: `SPR Branch ${suffix}`, products: [] },
  });
  return { customer, providerUser, supplierUser, supplier, branch };
}

async function seedJob(actors, suffix, storeOrder) {
  return prisma.job.create({
    data: {
      id: randomUUID(),
      title: `SPR job ${suffix}`,
      customerId: actors.customer.id,
      providerId: actors.providerUser.id,
      category: "tiling",
      description: "supplier payout regression",
      status: "ACCEPTED",
      price: dec(50),
      measurements: {},
      materials: [],
      images: [],
      meta: {
        storeOrders: [storeOrder],
      },
    },
  });
}

async function cleanup(fix) {
  if (!fix) return;
  if (fix.intent?.id) {
    await prisma.paymentIntent.update({ where: { id: fix.intent.id }, data: { payoutSettlementId: null } }).catch(() => {});
    await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.branchSettlementEvent.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { id: fix.intent.id } }).catch(() => {});
  }
  if (fix.order?.id) await prisma.materialOrder.deleteMany({ where: { id: fix.order.id } }).catch(() => {});
  if (fix.job?.id) await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  if (fix.branch?.id) {
    await prisma.branchWithdrawalProfile.deleteMany({ where: { branchId: fix.branch.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: fix.branch.id } }).catch(() => {});
  }
  if (fix.supplier?.id) await prisma.supplier.deleteMany({ where: { id: fix.supplier.id } }).catch(() => {});
  const userIds = [fix.customer?.id, fix.providerUser?.id, fix.supplierUser?.id].filter(Boolean);
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
}

function settlementRow(id, extra = {}) {
  return {
    id,
    status: extra.status || "success",
    currency: extra.currency || "ZAR",
    settlement_date: extra.settlement_date || "2026-09-16T00:00:00.000Z",
    effective_amount: extra.effective_amount === undefined ? 4368 : extra.effective_amount,
    total_amount: extra.total_amount === undefined ? 4368 : extra.total_amount,
    total_fees: extra.total_fees === undefined ? 282 : extra.total_fees,
    total_processed: extra.total_processed === undefined ? 4650 : extra.total_processed,
  };
}

async function run() {
  const r50 = splitCommission(50);
  assert.strictEqual(Number(r50.commissionAmount), 3.5);
  assert.strictEqual(Number(r50.recipientAmount), 46.5);
  const r50Net = computeExpectedBankSettlement(46.5, 2.82);
  assert.strictEqual(Number(r50Net.expectedBankSettlementAmount), 43.68);
  assert.strictEqual(toCents(r50Net.expectedBankSettlementAmount), 4368);

  const r80 = splitCommission(80);
  assert.strictEqual(Number(r80.commissionAmount), 5.6);
  assert.strictEqual(Number(r80.recipientAmount), 74.4);
  const r80Net = computeExpectedBankSettlement(74.4, 3.11);
  assert.strictEqual(Number(r80Net.expectedBankSettlementAmount), 71.29);
  assert.strictEqual(toCents(r80Net.expectedBankSettlementAmount), 7129);

  assert.strictEqual(mapPaystackSettlementApiStatus("success"), "SETTLED");
  assert.strictEqual(mapPaystackSettlementApiStatus("pending"), "PENDING");
  assert.notStrictEqual(mapPaystackSettlementApiStatus("success"), mapPayoutStatusToSupplierSettlementUi("PENDING"));
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("SETTLED"), "SUCCESS");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("PROCESSING"), "PROCESSING");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("PENDING"), "PENDING");

  const chargeOnly = payoutColumnsForPaidIntent(
    {
      kind: "JOB_STORE_ORDER",
      provider: "PAYSTACK",
      amount: dec(50),
      commissionAmount: dec(0),
      recipientAmount: dec(0),
    },
    { bearer: "subaccount", fees_split: { paystack: 282 }, status: "success", gateway_response: "Approved" }
  );
  assert.strictEqual(chargeOnly.payoutSettlementStatus, "PENDING");
  assert.notStrictEqual(chargeOnly.payoutSettlementStatus, "SETTLED");

  assert.strictEqual(
    resolveSupplierRecipientGrossMajor({
      kind: "JOB_STORE_ORDER",
      recipientAmount: 0,
      materialOrder: { supplierEarning: 46.5 },
    }),
    46.5
  );
  assert.strictEqual(
    resolveSupplierRecipientGrossMajor({
      kind: "JOB_STORE_ORDER",
      recipientAmount: 0,
      materialOrder: { supplierEarning: 0 },
    }),
    null
  );

  const srcAccounting = fs.readFileSync(
    path.join(__dirname, "../src/services/payments/supplierPayoutAccounting.util.js"),
    "utf8"
  );
  const srcAmounts = fs.readFileSync(
    path.join(__dirname, "../src/services/payments/supplierPayoutAmounts.util.js"),
    "utf8"
  );
  assert.doesNotMatch(srcAccounting, /4368/);
  assert.doesNotMatch(srcAccounting, /43\.68/);
  assert.doesNotMatch(srcAccounting, /EF-6519AF13AA274345980B/);
  assert.doesNotMatch(srcAmounts, /4368/);
  assert.doesNotMatch(srcAmounts, /43\.68/);
  const srcEscrow = fs.readFileSync(
    path.join(__dirname, "../src/services/payments/escrowSettlement.service.js"),
    "utf8"
  );
  assert.match(srcEscrow, /persistJobStoreMarketplaceAccounting/);

  const suffix = randomUUID().slice(0, 8);
  const acctR50 = `ACCT_SPR50_${suffix}`.toUpperCase();
  const acctR80 = `ACCT_SPR80_${suffix}`.toUpperCase();
  const acctAmb = `ACCT_SPRAMB_${suffix}`.toUpperCase();
  const ids = {
    r50: `92001${suffix.slice(0, 4)}`,
    r80: `92002${suffix.slice(0, 4)}`,
    charge: `92003${suffix.slice(0, 4)}`,
    amb: `92004${suffix.slice(0, 4)}`,
  };
  const fixtures = [];
  const fromTo = { from: "2026-09-10", to: "2026-09-20" };
  const paidAt = new Date("2026-09-12T10:00:00.000Z");

  const origList = paystack.listSettlements;
  const origTx = paystack.getSettlementTransactions;
  const origExport = paystack.getSettlementTransactionsViaExport;
  const origAuth = paystack.getAuthoritativeSettlementTransactions;
  const origResolve = paystack.resolvePaystackSubaccountId;
  const origIsConfigured = paystack.isConfigured;
  const jobService = require("../src/services/job.service");
  const origPay = jobService.payForStoreMaterials;

  paystack.isConfigured = () => true;
  paystack.getSettlementTransactions = async () => ({ transactions: [] });
  paystack.getSettlementTransactionsViaExport = async () => ({ transactions: [] });
  if (typeof paystack.getAuthoritativeSettlementTransactions === "function") {
    paystack.getAuthoritativeSettlementTransactions = async () => ({ transactions: [], source: "settlement_api" });
  }
  paystack.resolvePaystackSubaccountId = async (code) => String(code || "").toUpperCase();

  try {
    const actors = await seedActors(`${suffix}a`);
    const orderId = randomUUID();
    const job = await seedJob(actors, `${suffix}a`, {
      orderId,
      supplierId: actors.branch.id,
      items: [{ qty: 1, unitPrice: 50, name: "Tile" }],
      payment: { materialsPaid: true },
      deliveryType: "SELF",
      deliveryFee: 0,
    });
    const order = await prisma.materialOrder.create({
      data: {
        id: orderId,
        userId: actors.customer.id,
        supplierId: actors.supplier.id,
        branchId: actors.branch.id,
        jobId: job.id,
        paymentStatus: "paid",
        materialsSubtotal: dec(50),
        platformCommission: dec(3.5),
        supplierEarning: dec(46.5),
        settlementStatus: "NOT_APPLICABLE",
        settlementAmount: dec(0),
        payload: { totalAmount: 50, jobStoreOrderId: orderId },
        createdAt: paidAt,
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-6519AF13AA274345980B-${suffix}`.slice(0, 40),
        provider: "PAYSTACK",
        kind: "JOB_STORE_ORDER",
        paymentType: "JOB_STORE_ORDER",
        userId: actors.customer.id,
        jobId: job.id,
        amount: dec(50),
        commissionAmount: dec(0),
        recipientAmount: dec(0),
        currency: "ZAR",
        state: "PAID",
        paidAt,
        payoutSettlementStatus: "PENDING",
        gatewayPayload: payload(acctR50, { meta: { orderId } }),
      },
    });
    const r50Fix = { ...actors, job, order, intent };
    fixtures.push(r50Fix);

    const kpiBefore = await branchSettlementService.aggregateBranchSettlementSummary(
      actors.branch.id,
      actors.supplier.id,
      fromTo
    );
    assert.ok(kpiBefore.pendingSettlement >= 46.5, "Pending Settlement includes historical R50 supplier payout");
    assert.strictEqual(kpiBefore.settled, 0);

    const settledFromCharge = await rec.applyPaystackSettlementRow(
      settlementRow(ids.charge, { status: "paid", effective_amount: 4368, total_amount: 4368 }),
      { source: "reconcile_job", notify: false, scopedSubaccount: acctR50 }
    );
    assert.strictEqual(settledFromCharge.skipped, true);
    const afterCharge = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    assert.strictEqual(afterCharge.payoutSettlementStatus, "PENDING");
    assert.strictEqual(afterCharge.payoutSettlementId, null);
    assert.strictEqual(mapPayoutStatusToSupplierSettlementUi(afterCharge.payoutSettlementStatus), "PENDING");

    const applied = await rec.applyPaystackSettlementRow(settlementRow(ids.r50), {
      source: "reconcile_job",
      notify: false,
      scopedSubaccount: acctR50,
    });
    assert.strictEqual(applied.skipped, false);
    assert.strictEqual(applied.status, "SETTLED");
    assert.strictEqual(applied.matchingStrategy, "settlement_amount_single");

    const settledIntent = await prisma.paymentIntent.findUnique({
      where: { id: intent.id },
      include: { materialOrder: true },
    });
    assert.strictEqual(settledIntent.payoutSettlementStatus, "SETTLED");
    assert.ok(settledIntent.payoutSettlementId);
    assert.strictEqual(Number(settledIntent.recipientAmount), 46.5);
    assert.strictEqual(Number(settledIntent.commissionAmount), 3.5);
    assert.strictEqual(Number(settledIntent.processorFeeAmount), 2.82);
    assert.strictEqual(Number(settledIntent.expectedBankSettlementAmount), 43.68);
    assert.strictEqual(settledIntent.materialOrderId, order.id);
    assert.strictEqual(settledIntent.branchId, actors.branch.id);
    assert.strictEqual(mapPayoutStatusToSupplierSettlementUi(settledIntent.payoutSettlementStatus), "SUCCESS");

    const kpiAfter = await branchSettlementService.aggregateBranchSettlementSummary(
      actors.branch.id,
      actors.supplier.id,
      fromTo
    );
    assert.strictEqual(kpiAfter.pendingSettlement, 0);
    assert.strictEqual(kpiAfter.settled, 43.68);

    const again = await rec.applyPaystackSettlementRow(settlementRow(ids.r50), {
      source: "reconcile_job",
      notify: false,
      scopedSubaccount: acctR50,
    });
    assert.strictEqual(again.settlementId, applied.settlementId);
    assert.strictEqual(again.changed, false);
    const count = await prisma.gatewayPayoutSettlement.count({
      where: { gateway: "PAYSTACK", externalSettlementId: String(ids.r50) },
    });
    assert.strictEqual(count, 1);

    const actors80 = await seedActors(`${suffix}b`);
    const order80Id = randomUUID();
    const job80 = await seedJob(actors80, `${suffix}b`, {
      orderId: order80Id,
      supplierId: actors80.branch.id,
      items: [{ qty: 1, unitPrice: 80, name: "Grout" }],
      payment: { materialsPaid: false },
      deliveryType: "SELF",
      deliveryFee: 0,
    });
    const order80 = await prisma.materialOrder.create({
      data: {
        id: order80Id,
        userId: actors80.customer.id,
        supplierId: actors80.supplier.id,
        branchId: actors80.branch.id,
        jobId: job80.id,
        paymentStatus: "paid",
        materialsSubtotal: dec(80),
        platformCommission: dec(5.6),
        supplierEarning: dec(74.4),
        settlementStatus: "NOT_APPLICABLE",
        settlementAmount: dec(0),
        payload: { totalAmount: 80, jobStoreOrderId: order80Id },
      },
    });
    const intent80 = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-SPR80-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind: "JOB_STORE_ORDER",
        paymentType: "JOB_STORE_ORDER",
        userId: actors80.customer.id,
        jobId: job80.id,
        amount: dec(80),
        commissionAmount: dec(0),
        recipientAmount: dec(0),
        currency: "ZAR",
        state: "PAID",
        paidAt,
        payoutSettlementStatus: "PENDING",
        gatewayPayload: payload(acctR80, { feeCents: 311, meta: { orderId: order80Id } }),
      },
    });
    fixtures.push({ ...actors80, job: job80, order: order80, intent: intent80 });

    jobService.payForStoreMaterials = async () => ({ ok: true });
    const stamped = await escrowSettlement.settleJobStoreOrderFromIntent(intent80);
    assert.ok(stamped.applied || stamped.alreadyApplied || stamped.skipped);
    const future = await prisma.paymentIntent.findUnique({ where: { id: intent80.id } });
    assert.strictEqual(Number(future.commissionAmount), 5.6);
    assert.strictEqual(Number(future.recipientAmount), 74.4);
    assert.strictEqual(future.materialOrderId, order80.id);
    assert.strictEqual(future.branchId, actors80.branch.id);
    assert.strictEqual(Number(future.expectedBankSettlementAmount), 71.29);
    assert.strictEqual(future.payoutSettlementStatus, "PENDING");

    const applied80 = await rec.applyPaystackSettlementRow(
      settlementRow(ids.r80, {
        effective_amount: 7129,
        total_amount: 7129,
        total_fees: 311,
        total_processed: 7440,
      }),
      { source: "reconcile_job", notify: false, scopedSubaccount: acctR80 }
    );
    assert.strictEqual(applied80.skipped, false);
    assert.strictEqual(applied80.matchingStrategy, "settlement_amount_single");
    const settled80 = await prisma.paymentIntent.findUnique({ where: { id: intent80.id } });
    assert.strictEqual(settled80.payoutSettlementStatus, "SETTLED");

    const actorsAmb = await seedActors(`${suffix}c`);
    const tiedAt = new Date("2026-09-12T11:00:00.000Z");
    const ambJob = await seedJob(actorsAmb, `${suffix}c`, {
      orderId: randomUUID(),
      supplierId: actorsAmb.branch.id,
      items: [{ qty: 1, unitPrice: 50 }],
      payment: { materialsPaid: true },
    });
    const ambA = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-AMB-A-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind: "LABOR",
        paymentType: "FULL_UPFRONT",
        userId: actorsAmb.customer.id,
        jobId: ambJob.id,
        amount: dec(50),
        commissionAmount: dec(3.5),
        recipientAmount: dec(46.5),
        processorFeeAmount: dec(2.82),
        expectedBankSettlementAmount: dec(43.68),
        currency: "ZAR",
        state: "PAID",
        paidAt: tiedAt,
        payoutSettlementStatus: "PENDING",
        gatewayPayload: payload(acctAmb),
      },
    });
    const ambB = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-AMB-B-${suffix}`.toUpperCase(),
        provider: "PAYSTACK",
        kind: "LABOR",
        paymentType: "FULL_UPFRONT",
        userId: actorsAmb.customer.id,
        jobId: ambJob.id,
        amount: dec(50),
        commissionAmount: dec(3.5),
        recipientAmount: dec(46.5),
        processorFeeAmount: dec(2.82),
        expectedBankSettlementAmount: dec(43.68),
        currency: "ZAR",
        state: "PAID",
        paidAt: tiedAt,
        payoutSettlementStatus: "PENDING",
        gatewayPayload: payload(acctAmb),
      },
    });
    fixtures.push({ ...actorsAmb, job: ambJob, intent: ambA }, { intent: ambB });
    const ambiguous = await rec.applyPaystackSettlementRow(settlementRow(ids.amb), {
      source: "reconcile_job",
      notify: false,
      scopedSubaccount: acctAmb,
    });
    assert.strictEqual(ambiguous.skipped, true);
    assert.strictEqual(ambiguous.reason, "ambiguous_amount_match");
    const ambAFresh = await prisma.paymentIntent.findUnique({ where: { id: ambA.id } });
    const ambBFresh = await prisma.paymentIntent.findUnique({ where: { id: ambB.id } });
    assert.strictEqual(ambAFresh.payoutSettlementStatus, "PENDING");
    assert.strictEqual(ambBFresh.payoutSettlementStatus, "PENDING");

    console.log("supplierPayoutReconciliation.regression.test.js: OK");
  } finally {
    jobService.payForStoreMaterials = origPay;
    paystack.listSettlements = origList;
    paystack.getSettlementTransactions = origTx;
    paystack.getSettlementTransactionsViaExport = origExport;
    if (origAuth) paystack.getAuthoritativeSettlementTransactions = origAuth;
    paystack.resolvePaystackSubaccountId = origResolve;
    paystack.isConfigured = origIsConfigured;
    await wipeSettlements(Object.values(ids));
    for (const fix of fixtures.reverse()) {
      await cleanup(fix);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
