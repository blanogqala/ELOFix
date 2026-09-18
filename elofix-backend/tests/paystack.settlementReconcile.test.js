require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const paystack = require("../src/services/payments/paystack.gateway");

const ACCT_A = "ACCT_PROV_A";
const ACCT_B = "ACCT_PROV_B";
const ACCT_SUP = "ACCT_SUP_OK";
const ACCT_SUP_WRONG = "ACCT_SUP_WRONG";
const ACCT_OLD = "ACCT_HIST_OLD";
const ACCT_NEW = "ACCT_HIST_NEW";

function laborPayload(subaccount) {
  return { subaccount, bearer: "subaccount", fees_split: { paystack: 282 } };
}

async function seedLaborPair(suffix, subaccount = ACCT_A) {
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
  const shared = {
    provider: "PAYSTACK",
    kind: "LABOR",
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
    gatewayPayload: laborPayload(subaccount),
  };
  const a = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-D3A-${suffix}`.toUpperCase(),
      paymentType: "DEPOSIT",
      ...shared,
    },
  });
  const b = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-D3B-${suffix}`.toUpperCase(),
      paymentType: "COMPLETION",
      ...shared,
    },
  });
  return { customer, providerUser, job, a, b };
}

async function seedSupplierIntent(suffix, subaccount) {
  const customer = await prisma.user.create({
    data: {
      email: `d3.scust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: `D3 Supplier ${suffix}` },
  });
  const branch = await prisma.branch.create({
    data: { supplierId: supplier.id, name: `D3 Branch ${suffix}` },
  });
  const order = await prisma.materialOrder.create({
    data: {
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branch.id,
      paymentStatus: "paid",
      materialsSubtotal: 50,
      payload: { totalAmount: 50 },
    },
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-D3S-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: order.id,
      branchId: branch.id,
      amount: new Prisma.Decimal("50.00"),
      commissionAmount: new Prisma.Decimal("3.50"),
      recipientAmount: new Prisma.Decimal("46.50"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      payoutSettlementStatus: "PENDING",
      gatewayPayload: laborPayload(subaccount),
    },
  });
  return { customer, supplier, branch, order, intent };
}

async function cleanupLabor(fix) {
  if (!fix) return;
  await prisma.gatewayPayoutSettlementItem
    .deleteMany({ where: { paymentIntentId: { in: [fix.a.id, fix.b.id] } } })
    .catch(() => {});
  await prisma.paymentIntent.deleteMany({ where: { id: { in: [fix.a.id, fix.b.id] } } }).catch(() => {});
  await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.providerUser.id] } } }).catch(() => {});
}

async function cleanupSupplier(fix) {
  if (!fix) return;
  await prisma.gatewayPayoutSettlementItem
    .deleteMany({ where: { paymentIntentId: fix.intent.id } })
    .catch(() => {});
  await prisma.paymentIntent.deleteMany({ where: { id: fix.intent.id } }).catch(() => {});
  await prisma.materialOrder.deleteMany({ where: { id: fix.order.id } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { id: fix.branch.id } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { id: fix.supplier.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: fix.customer.id } }).catch(() => {});
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

function txnsFor(intents) {
  return {
    transactions: intents.map((intent) => ({
      reference: intent.merchantReference,
      fees_split: { paystack: 282 },
      bearer: "subaccount",
    })),
  };
}

async function run() {
  const suffix = randomUUID().slice(0, 8);
  const labor = await seedLaborPair(suffix, ACCT_A);
  const other = await seedLaborPair(`${suffix}x`, ACCT_B);
  const supplierOk = await seedSupplierIntent(`${suffix}ok`, ACCT_SUP);
  const supplierBad = await seedSupplierIntent(`${suffix}bad`, ACCT_SUP);
  const historical = await seedLaborPair(`${suffix}h`, ACCT_OLD);
  if (!process.env.PAYSTACK_MODE) process.env.PAYSTACK_MODE = "test";
  const histProvider = await prisma.provider.create({
    data: {
      userId: historical.providerUser.id,
      businessName: `Hist Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  await prisma.providerWithdrawalProfile.create({
    data: {
      id: randomUUID(),
      providerId: histProvider.id,
      bankName: "FNB",
      accountHolder: "Provider",
      accountNumber: "enc:test-hist-acct",
      branchCode: "enc:test-250655",
      accountType: "CHEQUE",
      verificationStatus: "VERIFIED",
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: ACCT_NEW,
      gatewayProfileStatus: "ACTIVE",
      gatewayProfilePayload: { domain: "test", subaccount_code: ACCT_NEW },
      isActive: true,
    },
  });
  const origList = paystack.listSettlements;
  const origTx = paystack.getSettlementTransactions;

  const ids = {
    main: `88001${suffix.slice(0, 4)}`,
    provider: `88002${suffix.slice(0, 4)}`,
    wrong: `88003${suffix.slice(0, 4)}`,
    mixed: `88004${suffix.slice(0, 4)}`,
    supOk: `88005${suffix.slice(0, 4)}`,
    supBad: `88006${suffix.slice(0, 4)}`,
    byId: `88007${suffix.slice(0, 4)}`,
    histOld: `88008${suffix.slice(0, 4)}`,
    histNew: `88009${suffix.slice(0, 4)}`,
  };

  paystack.getSettlementTransactions = async (settlementId) => {
    const id = String(settlementId);
    if (id === String(ids.mixed)) {
      return txnsFor([labor.a, other.a]);
    }
    if (id === String(ids.supOk) || id === String(ids.supBad)) {
      const intent = id === String(ids.supOk) ? supplierOk.intent : supplierBad.intent;
      return txnsFor([intent]);
    }
    if (id === String(ids.histOld)) {
      return txnsFor([historical.a]);
    }
    if (id === String(ids.histNew)) {
      return txnsFor([historical.b]);
    }
    return txnsFor([labor.a, labor.b]);
  };

  paystack.listSettlements = async (opts = {}) => {
    const scoped = String(opts.subaccount || "");
    if (!scoped || scoped.toLowerCase() === "none") {
      throw new Error("recipient reconcile must not list unscoped or main-account settlements");
    }
    if (scoped.toUpperCase() === ACCT_A.toUpperCase()) {
      return {
        settlements: [
          { id: ids.provider, status: "success", currency: "ZAR", settlement_date: "2026-09-15T00:00:00.000Z" },
        ],
      };
    }
    return { settlements: [] };
  };

  try {
    const applyOpts = (scopedSubaccount) => ({
      source: "reconcile_job",
      notify: false,
      scopedSubaccount,
    });

    // H / A (main): same refs, no recipient scope — must not SETTLED
    const mainNone = await rec.applyPaystackSettlementRow(
      { id: ids.main, status: "success", currency: "ZAR" },
      applyOpts("none")
    );
    assert.strictEqual(mainNone.skipped, true);
    assert.strictEqual(mainNone.reason, "main_account_settlement_ignored");

    const mainMissing = await rec.applyPaystackSettlementRow(
      { id: ids.main, status: "success", currency: "ZAR" },
      { source: "reconcile_job", notify: false }
    );
    assert.strictEqual(mainMissing.skipped, true);
    assert.strictEqual(mainMissing.reason, "missing_recipient_subaccount_scope");

    let a = await prisma.paymentIntent.findUnique({ where: { id: labor.a.id } });
    assert.strictEqual(a.payoutSettlementStatus, "PENDING");

    // B: wrong ACCT
    const wrong = await rec.applyPaystackSettlementRow(
      { id: ids.wrong, status: "success", currency: "ZAR" },
      applyOpts(ACCT_B)
    );
    assert.strictEqual(wrong.skipped, true);
    a = await prisma.paymentIntent.findUnique({ where: { id: labor.a.id } });
    assert.strictEqual(a.payoutSettlementStatus, "PENDING");
    assert.strictEqual(a.payoutSettlementId, null);

    // C + F: correct ACCT, two intents same subaccount, persist scope even if API omits code
    const first = await rec.applyPaystackSettlementRow(
      {
        id: ids.provider,
        status: "success",
        currency: "ZAR",
        settlement_date: "2026-09-15T00:00:00.000Z",
      },
      applyOpts(ACCT_A)
    );
    assert.strictEqual(first.skipped, false);
    assert.strictEqual(first.linked, 2);
    assert.strictEqual(first.status, "SETTLED");

    const settlement = await prisma.gatewayPayoutSettlement.findUnique({
      where: {
        gateway_externalSettlementId: {
          gateway: "PAYSTACK",
          externalSettlementId: String(ids.provider),
        },
      },
    });
    assert.ok(settlement);
    assert.strictEqual(settlement.subaccountCode, ACCT_A);

    const items = await prisma.gatewayPayoutSettlementItem.findMany({
      where: { settlementId: settlement.id },
    });
    assert.strictEqual(items.length, 2);

    a = await prisma.paymentIntent.findUnique({ where: { id: labor.a.id } });
    const b = await prisma.paymentIntent.findUnique({ where: { id: labor.b.id } });
    assert.strictEqual(a.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(b.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(a.payoutSettlementId, settlement.id);
    assert.strictEqual(b.payoutSettlementId, settlement.id);
    assert.strictEqual(Number(a.commissionAmount), 3.5);
    assert.strictEqual(Number(a.recipientAmount), 46.5);
    assert.strictEqual(Number(a.processorFeeAmount), 2.82);
    assert.strictEqual(Number(a.expectedBankSettlementAmount), 43.68);

    // I: idempotent re-run
    const eventCountBefore = await prisma.gatewayPayoutSettlementEvent.count({
      where: { settlementId: settlement.id },
    });
    const second = await rec.applyPaystackSettlementRow(
      {
        id: ids.provider,
        status: "success",
        currency: "ZAR",
        settlement_date: "2026-09-15T00:00:00.000Z",
      },
      applyOpts(ACCT_A)
    );
    assert.strictEqual(second.settlementId, first.settlementId);
    assert.strictEqual(second.linked, 2);
    assert.strictEqual(second.changed, false);
    const count = await prisma.gatewayPayoutSettlement.count({
      where: { gateway: "PAYSTACK", externalSettlementId: String(ids.provider) },
    });
    assert.strictEqual(count, 1);
    const itemsAfter = await prisma.gatewayPayoutSettlementItem.count({
      where: { settlementId: settlement.id },
    });
    assert.strictEqual(itemsAfter, 2);
    const eventCountAfter = await prisma.gatewayPayoutSettlementEvent.count({
      where: { settlementId: settlement.id },
    });
    assert.strictEqual(eventCountAfter, eventCountBefore);

    const failed = await rec.applyPaystackSettlementRow(
      { id: ids.provider, status: "mystery-status", currency: "ZAR" },
      applyOpts(ACCT_A)
    );
    assert.strictEqual(failed.skipped, true);

    // D: supplier wrong subaccount
    const supWrong = await rec.applyPaystackSettlementRow(
      { id: ids.supBad, status: "success", currency: "ZAR" },
      applyOpts(ACCT_SUP_WRONG)
    );
    assert.strictEqual(supWrong.skipped, true);
    const supplierBadFresh = await prisma.paymentIntent.findUnique({ where: { id: supplierBad.intent.id } });
    assert.strictEqual(supplierBadFresh.payoutSettlementStatus, "PENDING");

    // E: supplier correct subaccount
    const supOk = await rec.applyPaystackSettlementRow(
      { id: ids.supOk, status: "success", currency: "ZAR" },
      applyOpts(ACCT_SUP)
    );
    assert.strictEqual(supOk.skipped, false);
    assert.strictEqual(supOk.linked, 1);
    const supplierOkFresh = await prisma.paymentIntent.findUnique({ where: { id: supplierOk.intent.id } });
    assert.strictEqual(supplierOkFresh.payoutSettlementStatus, "SETTLED");

    // G: mixed recipients in one settlement
    const mixed = await rec.applyPaystackSettlementRow(
      { id: ids.mixed, status: "success", currency: "ZAR" },
      applyOpts(ACCT_A)
    );
    assert.strictEqual(mixed.skipped, true);
    assert.strictEqual(mixed.reason, "mixed_or_mismatched_recipient_subaccount");
    const otherFresh = await prisma.paymentIntent.findUnique({ where: { id: other.a.id } });
    assert.strictEqual(otherFresh.payoutSettlementStatus, "PENDING");
    assert.strictEqual(otherFresh.payoutSettlementId, null);

    // 10: byId without scope cannot synthesize SETTLED
    const byIdBare = await rec.reconcilePaystackSettlementById(ids.byId, {
      status: "success",
      notify: false,
    });
    assert.strictEqual(byIdBare.skipped, true);
    assert.strictEqual(byIdBare.reason, "missing_recipient_subaccount_scope");

    const byIdWrong = await rec.reconcilePaystackSettlementById(ids.provider, {
      status: "success",
      notify: false,
      scopedSubaccount: ACCT_B,
    });
    assert.strictEqual(byIdWrong.skipped, true);

    const byIdMissing = await rec.reconcilePaystackSettlementById(ids.byId, {
      status: "success",
      notify: false,
      scopedSubaccount: ACCT_A,
    });
    assert.strictEqual(byIdMissing.skipped, true);
    assert.strictEqual(byIdMissing.reason, "settlement_not_in_subaccount_scope");

    const byIdOk = await rec.reconcilePaystackSettlementById(ids.provider, {
      status: "success",
      notify: false,
      scopedSubaccount: ACCT_A,
    });
    assert.strictEqual(byIdOk.skipped, false);
    assert.strictEqual(byIdOk.settlementId, first.settlementId);

    // Historical charge-time ACCT_OLD vs current profile ACCT_NEW
    const histOld = await rec.applyPaystackSettlementRow(
      { id: ids.histOld, status: "success", currency: "ZAR" },
      applyOpts(ACCT_OLD)
    );
    assert.strictEqual(histOld.skipped, false);
    assert.strictEqual(histOld.linked, 1);
    const histSettled = await prisma.paymentIntent.findUnique({ where: { id: historical.a.id } });
    assert.strictEqual(histSettled.payoutSettlementStatus, "SETTLED");
    const histRow = await prisma.gatewayPayoutSettlement.findUnique({
      where: {
        gateway_externalSettlementId: {
          gateway: "PAYSTACK",
          externalSettlementId: String(ids.histOld),
        },
      },
    });
    assert.strictEqual(histRow.subaccountCode, ACCT_OLD);

    const histNew = await rec.applyPaystackSettlementRow(
      { id: ids.histNew, status: "success", currency: "ZAR" },
      applyOpts(ACCT_NEW)
    );
    assert.strictEqual(histNew.skipped, true);
    const histB = await prisma.paymentIntent.findUnique({ where: { id: historical.b.id } });
    assert.strictEqual(histB.payoutSettlementStatus, "PENDING");
    assert.strictEqual(histB.payoutSettlementId, null);

    // Settlement API processing then success; fees from txn.fees when fees_split is absent
    ids.proc = `88010${suffix.slice(0, 4)}`;
    const pendingIntent = await prisma.paymentIntent.findUnique({ where: { id: other.a.id } });
    paystack.getSettlementTransactions = async (settlementId) => {
      if (String(settlementId) === String(ids.proc)) {
        return {
          transactions: [
            {
              reference: pendingIntent.merchantReference,
              fees: 282,
              fees_split: null,
              bearer: "subaccount",
            },
          ],
        };
      }
      return txnsFor([labor.a, labor.b]);
    };
    const processing = await rec.applyPaystackSettlementRow(
      { id: ids.proc, status: "processing", currency: "ZAR" },
      applyOpts(ACCT_B)
    );
    assert.strictEqual(processing.skipped, false);
    assert.strictEqual(processing.status, "PROCESSING");
    const afterProcessing = await prisma.paymentIntent.findUnique({ where: { id: other.a.id } });
    assert.strictEqual(afterProcessing.payoutSettlementStatus, "PROCESSING");
    assert.ok(afterProcessing.payoutSettlementId);
    assert.strictEqual(Number(afterProcessing.processorFeeAmount), 2.82);
    const settledFromProcessing = await rec.applyPaystackSettlementRow(
      { id: ids.proc, status: "success", currency: "ZAR" },
      applyOpts(ACCT_B)
    );
    assert.strictEqual(settledFromProcessing.status, "SETTLED");
    const afterSettled = await prisma.paymentIntent.findUnique({ where: { id: other.a.id } });
    assert.strictEqual(afterSettled.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(Number(afterSettled.amount), 50);
    assert.strictEqual(Number(afterSettled.commissionAmount), 3.5);
    assert.strictEqual(Number(afterSettled.recipientAmount), 46.5);

    console.log("paystack.settlementReconcile.test.js: all passed");
  } finally {
    paystack.listSettlements = origList;
    paystack.getSettlementTransactions = origTx;
    await wipeSettlements(Object.values(ids));
    await prisma.providerWithdrawalProfile.deleteMany({ where: { providerId: histProvider.id } }).catch(() => {});
    await prisma.provider.deleteMany({ where: { id: histProvider.id } }).catch(() => {});
    await cleanupLabor(labor);
    await cleanupLabor(other);
    await cleanupLabor(historical);
    await cleanupSupplier(supplierOk);
    await cleanupSupplier(supplierBad);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
