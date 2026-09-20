/**
 * Paystack settlement-level amount fallback. Membership match still wins.
 * Does not move money or change 7%/93%.
 * Run: node tests/paystack.settlementAmountFallback.test.js
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
const { splitCommission, computeExpectedBankSettlement, toCents } = require("../src/services/payments/money.util");
const { ELOFIX_GROSS_COMMISSION_PERCENT } = require("../src/services/payments/paystack.payload");

function payload(subaccount) {
  return { subaccount, bearer: "subaccount", fees_split: { paystack: 282 } };
}

async function seedIntent({ suffix, acct, paidAt, extras = {} }) {
  const customer = await prisma.user.create({
    data: {
      email: `amt.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `amt.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      title: "Amount fallback",
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
      merchantReference: extras.merchantReference || `EF-AMT-${suffix}`.toUpperCase(),
      provider: extras.provider || "PAYSTACK",
      kind: extras.kind || "LABOR",
      paymentType: "FULL_UPFRONT",
      userId: customer.id,
      jobId: job.id,
      recipientUserId: providerUser.id,
      amount: extras.amount || new Prisma.Decimal("50.00"),
      commissionAmount: extras.commissionAmount || new Prisma.Decimal("3.50"),
      recipientAmount: extras.recipientAmount || new Prisma.Decimal("46.50"),
      processorFeeAmount:
        extras.processorFeeAmount === undefined ? new Prisma.Decimal("2.82") : extras.processorFeeAmount,
      expectedBankSettlementAmount:
        extras.expectedBankSettlementAmount === undefined
          ? new Prisma.Decimal("43.68")
          : extras.expectedBankSettlementAmount,
      currency: extras.currency || "ZAR",
      state: "PAID",
      paidAt: paidAt || new Date("2026-09-10T10:00:00.000Z"),
      payoutSettlementStatus: "PENDING",
      gatewayPayload: extras.gatewayPayload || payload(acct),
    },
  });
  return { customer, providerUser, job, intent, acct };
}

async function cleanup(fix) {
  if (!fix) return;
  await prisma.paymentIntent
    .update({ where: { id: fix.intent.id }, data: { payoutSettlementId: null } })
    .catch(() => {});
  await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
  await prisma.paymentIntent.deleteMany({ where: { id: fix.intent.id } }).catch(() => {});
  await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.providerUser.id] } } }).catch(() => {});
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

function settlementRow(id, extra = {}) {
  return {
    id,
    status: extra.status || "success",
    currency: extra.currency || "ZAR",
    settlement_date: extra.settlement_date || "2026-09-15T00:00:00.000Z",
    effective_amount: extra.effective_amount === undefined ? 4368 : extra.effective_amount,
    total_amount: extra.total_amount === undefined ? 4368 : extra.total_amount,
    total_fees: extra.total_fees === undefined ? 282 : extra.total_fees,
    total_processed: extra.total_processed === undefined ? 4650 : extra.total_processed,
  };
}

async function run() {
  const split = splitCommission(50);
  assert.strictEqual(Number(split.commissionAmount), 3.5);
  assert.strictEqual(Number(split.recipientAmount), 46.5);
  const net = computeExpectedBankSettlement(46.5, 2.82);
  assert.strictEqual(Number(net.expectedBankSettlementAmount), 43.68);
  assert.strictEqual(toCents(net.expectedBankSettlementAmount), 4368);
  assert.strictEqual(ELOFIX_GROSS_COMMISSION_PERCENT, 7);

  const srcGateway = fs.readFileSync(path.join(__dirname, "../src/services/payments/paystack.gateway.js"), "utf8");
  assert.match(srcGateway, /async function refund\(/);
  const srcMatch = fs.readFileSync(
    path.join(__dirname, "../src/services/payments/paystack.settlementAmountMatch.js"),
    "utf8"
  );
  assert.doesNotMatch(srcMatch, /payfast/i);
  assert.doesNotMatch(srcMatch, /11734367/);
  assert.doesNotMatch(srcMatch, /43\.68/);
  const payfast = require("../src/services/payments/payfast.gateway");
  assert.strictEqual(typeof payfast.createCheckout, "function");

  const suffix = randomUUID().slice(0, 8);
  const numericIds = new Map();
  let nextNumeric = 410001;
  function acctFor(label) {
    return `ACCT_${label}_${suffix}`.toUpperCase();
  }
  function numericFor(code) {
    const key = String(code || "").toUpperCase();
    if (!numericIds.has(key)) numericIds.set(key, nextNumeric++);
    return numericIds.get(key);
  }

  const origList = paystack.listSettlements;
  const origTx = paystack.getSettlementTransactions;
  const origExport = paystack.getSettlementTransactionsViaExport;
  const origResolve = paystack.resolvePaystackSubaccountId;

  paystack.getSettlementTransactions = async () => ({ transactions: [] });
  paystack.getSettlementTransactionsViaExport = async () => ({ transactions: [] });
  paystack.resolvePaystackSubaccountId = async (code) => {
    const raw = String(code || "");
    if (!/^ACCT_/i.test(raw)) return null;
    return numericFor(raw);
  };

  const fixtures = [];
  const ids = {
    refWin: `91001${suffix.slice(0, 4)}`,
    single: `91002${suffix.slice(0, 4)}`,
    mismatch: `91003${suffix.slice(0, 4)}`,
    otherAcct: `91004${suffix.slice(0, 4)}`,
    after: `91005${suffix.slice(0, 4)}`,
    ambiguous: `91006${suffix.slice(0, 4)}`,
    oldDup: `91007${suffix.slice(0, 4)}`,
    newDup: `91008${suffix.slice(0, 4)}`,
    batch: `91009${suffix.slice(0, 4)}`,
    batchMiss: `91010${suffix.slice(0, 4)}`,
    missingNet: `91011${suffix.slice(0, 4)}`,
    main: `91012${suffix.slice(0, 4)}`,
    hist: `91013${suffix.slice(0, 4)}`,
    histNew: `91014${suffix.slice(0, 4)}`,
  };

  const applyOpts = (scoped) => ({ source: "reconcile_job", notify: false, scopedSubaccount: scoped });

  try {
    const acctRef = acctFor("ref");
    const refA = await seedIntent({ suffix: `${suffix}a`, acct: acctRef });
    const refB = await seedIntent({
      suffix: `${suffix}b`,
      acct: acctRef,
      paidAt: new Date("2026-09-11T10:00:00.000Z"),
    });
    fixtures.push(refA, refB);
    paystack.getSettlementTransactions = async (settlementId) => {
      if (String(settlementId) === String(ids.refWin)) {
        return { transactions: [{ reference: refA.intent.merchantReference, fees_split: { paystack: 282 } }] };
      }
      return { transactions: [] };
    };
    const refWin = await rec.applyPaystackSettlementRow(settlementRow(ids.refWin), applyOpts(acctRef));
    assert.strictEqual(refWin.skipped, false);
    assert.strictEqual(refWin.matchingStrategy, "reference");
    assert.strictEqual(refWin.linked, 1);
    const refAFresh = await prisma.paymentIntent.findUnique({ where: { id: refA.intent.id } });
    const refBFresh = await prisma.paymentIntent.findUnique({ where: { id: refB.intent.id } });
    assert.strictEqual(refAFresh.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(refBFresh.payoutSettlementStatus, "PENDING");
    assert.strictEqual(Number(refAFresh.amount), 50);
    assert.strictEqual(Number(refAFresh.commissionAmount), 3.5);
    assert.strictEqual(Number(refAFresh.recipientAmount), 46.5);

    paystack.getSettlementTransactions = async () => ({ transactions: [] });

    const acctOne = acctFor("one");
    const one = await seedIntent({ suffix: `${suffix}one`, acct: acctOne });
    fixtures.push(one);
    const single = await rec.applyPaystackSettlementRow(settlementRow(ids.single), applyOpts(acctOne));
    assert.strictEqual(single.skipped, false);
    assert.strictEqual(single.status, "SETTLED");
    assert.strictEqual(single.matchingStrategy, "settlement_amount_single");
    const oneFresh = await prisma.paymentIntent.findUnique({ where: { id: one.intent.id } });
    assert.strictEqual(oneFresh.payoutSettlementStatus, "SETTLED");
    assert.ok(oneFresh.payoutSettlementId);
    assert.strictEqual(Number(oneFresh.processorFeeAmount), 2.82);
    assert.strictEqual(Number(oneFresh.expectedBankSettlementAmount), 43.68);

    const again = await rec.applyPaystackSettlementRow(settlementRow(ids.single), applyOpts(acctOne));
    assert.strictEqual(again.settlementId, single.settlementId);
    assert.strictEqual(again.changed, false);
    const count = await prisma.gatewayPayoutSettlement.count({
      where: { gateway: "PAYSTACK", externalSettlementId: String(ids.single) },
    });
    assert.strictEqual(count, 1);

    const acctMiss = acctFor("miss");
    const miss = await seedIntent({ suffix: `${suffix}miss`, acct: acctMiss });
    fixtures.push(miss);
    const mismatch = await rec.applyPaystackSettlementRow(
      settlementRow(ids.mismatch, { effective_amount: 9999, total_amount: 9999 }),
      applyOpts(acctMiss)
    );
    assert.strictEqual(mismatch.skipped, true);
    assert.strictEqual(mismatch.reason, "amount_mismatch");
    const missFresh = await prisma.paymentIntent.findUnique({ where: { id: miss.intent.id } });
    assert.strictEqual(missFresh.payoutSettlementStatus, "PENDING");
    assert.strictEqual(missFresh.payoutSettlementId, null);

    const acctScope = acctFor("scope");
    const acctOther = acctFor("other");
    const other = await seedIntent({ suffix: `${suffix}oth`, acct: acctOther });
    fixtures.push(other);
    const otherSkip = await rec.applyPaystackSettlementRow(settlementRow(ids.otherAcct), applyOpts(acctScope));
    assert.strictEqual(otherSkip.skipped, true);
    const otherFresh = await prisma.paymentIntent.findUnique({ where: { id: other.intent.id } });
    assert.strictEqual(otherFresh.payoutSettlementStatus, "PENDING");

    const acctLate = acctFor("late");
    const late = await seedIntent({
      suffix: `${suffix}late`,
      acct: acctLate,
      paidAt: new Date("2026-09-16T10:00:00.000Z"),
    });
    fixtures.push(late);
    const lateSkip = await rec.applyPaystackSettlementRow(settlementRow(ids.after), applyOpts(acctLate));
    assert.strictEqual(lateSkip.skipped, true);
    assert.strictEqual(lateSkip.reason, "payment_after_settlement");
    const lateFresh = await prisma.paymentIntent.findUnique({ where: { id: late.intent.id } });
    assert.strictEqual(lateFresh.payoutSettlementStatus, "PENDING");

    const acctTied = acctFor("tied");
    const tiedAt = new Date("2026-09-10T12:00:00.000Z");
    const tied1 = await seedIntent({ suffix: `${suffix}t1`, acct: acctTied, paidAt: tiedAt });
    const tied2 = await seedIntent({ suffix: `${suffix}t2`, acct: acctTied, paidAt: tiedAt });
    fixtures.push(tied1, tied2);
    const ambiguous = await rec.applyPaystackSettlementRow(settlementRow(ids.ambiguous), applyOpts(acctTied));
    assert.strictEqual(ambiguous.skipped, true);
    assert.strictEqual(ambiguous.reason, "ambiguous_amount_match");
    const tied1Fresh = await prisma.paymentIntent.findUnique({ where: { id: tied1.intent.id } });
    const tied2Fresh = await prisma.paymentIntent.findUnique({ where: { id: tied2.intent.id } });
    assert.strictEqual(tied1Fresh.payoutSettlementStatus, "PENDING");
    assert.strictEqual(tied2Fresh.payoutSettlementStatus, "PENDING");

    const acctChrono = acctFor("chrono");
    const chrono1 = await seedIntent({
      suffix: `${suffix}c1`,
      acct: acctChrono,
      paidAt: new Date("2026-09-08T10:00:00.000Z"),
    });
    const chrono2 = await seedIntent({
      suffix: `${suffix}c2`,
      acct: acctChrono,
      paidAt: new Date("2026-09-09T10:00:00.000Z"),
    });
    fixtures.push(chrono1, chrono2);
    paystack.listSettlements = async (opts = {}) => {
      assert.strictEqual(Number(opts.subaccount), numericFor(acctChrono));
      return {
        settlements: [
          settlementRow(ids.newDup, { settlement_date: "2026-09-16T00:00:00.000Z" }),
          settlementRow(ids.oldDup, { settlement_date: "2026-09-15T00:00:00.000Z" }),
        ],
      };
    };
    const listed = await rec.reconcilePaystackSubaccountSettlements({
      subaccount: acctChrono,
      from: "2026-09-01",
      to: "2026-09-30",
      notify: false,
    });
    assert.ok(listed.linked >= 2);
    const c1 = await prisma.paymentIntent.findUnique({ where: { id: chrono1.intent.id } });
    const c2 = await prisma.paymentIntent.findUnique({ where: { id: chrono2.intent.id } });
    assert.strictEqual(c1.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(c2.payoutSettlementStatus, "SETTLED");
    assert.notStrictEqual(c1.payoutSettlementId, c2.payoutSettlementId);
    const oldSett = await prisma.gatewayPayoutSettlement.findUnique({
      where: { gateway_externalSettlementId: { gateway: "PAYSTACK", externalSettlementId: String(ids.oldDup) } },
    });
    const newSett = await prisma.gatewayPayoutSettlement.findUnique({
      where: { gateway_externalSettlementId: { gateway: "PAYSTACK", externalSettlementId: String(ids.newDup) } },
    });
    assert.strictEqual(c1.payoutSettlementId, oldSett.id);
    assert.strictEqual(c2.payoutSettlementId, newSett.id);

    const acctBatch = acctFor("batch");
    const batchA = await seedIntent({
      suffix: `${suffix}ba`,
      acct: acctBatch,
      paidAt: new Date("2026-09-06T10:00:00.000Z"),
    });
    const batchB = await seedIntent({
      suffix: `${suffix}bb`,
      acct: acctBatch,
      paidAt: new Date("2026-09-07T10:00:00.000Z"),
      extras: {
        amount: new Prisma.Decimal("100.00"),
        commissionAmount: new Prisma.Decimal("7.00"),
        recipientAmount: new Prisma.Decimal("93.00"),
        processorFeeAmount: new Prisma.Decimal("0.00"),
        expectedBankSettlementAmount: new Prisma.Decimal("93.00"),
      },
    });
    fixtures.push(batchA, batchB);
    const batch = await rec.applyPaystackSettlementRow(
      settlementRow(ids.batch, { effective_amount: 13668, total_amount: 13668 }),
      applyOpts(acctBatch)
    );
    assert.strictEqual(batch.skipped, false);
    assert.strictEqual(batch.matchingStrategy, "settlement_amount_batch");
    assert.strictEqual(batch.linked, 2);
    const ba = await prisma.paymentIntent.findUnique({ where: { id: batchA.intent.id } });
    const bb = await prisma.paymentIntent.findUnique({ where: { id: batchB.intent.id } });
    assert.strictEqual(ba.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(bb.payoutSettlementStatus, "SETTLED");
    assert.strictEqual(ba.payoutSettlementId, bb.payoutSettlementId);

    const acctBad = acctFor("bad");
    const badA = await seedIntent({
      suffix: `${suffix}ia`,
      acct: acctBad,
      paidAt: new Date("2026-09-05T10:00:00.000Z"),
    });
    const badB = await seedIntent({
      suffix: `${suffix}ib`,
      acct: acctBad,
      paidAt: new Date("2026-09-05T11:00:00.000Z"),
      extras: {
        expectedBankSettlementAmount: new Prisma.Decimal("93.00"),
        recipientAmount: new Prisma.Decimal("93.00"),
        processorFeeAmount: new Prisma.Decimal("0.00"),
      },
    });
    fixtures.push(badA, badB);
    const batchMiss = await rec.applyPaystackSettlementRow(
      settlementRow(ids.batchMiss, { effective_amount: 10000, total_amount: 10000 }),
      applyOpts(acctBad)
    );
    assert.strictEqual(batchMiss.skipped, true);
    assert.strictEqual(batchMiss.reason, "amount_mismatch");

    const acctNoNet = acctFor("nonet");
    const noNet = await seedIntent({
      suffix: `${suffix}nn`,
      acct: acctNoNet,
      extras: { processorFeeAmount: null, expectedBankSettlementAmount: null },
    });
    fixtures.push(noNet);
    const missingNet = await rec.applyPaystackSettlementRow(settlementRow(ids.missingNet), applyOpts(acctNoNet));
    assert.strictEqual(missingNet.skipped, true);
    assert.strictEqual(missingNet.reason, "missing_recipient_net");
    const noNetFresh = await prisma.paymentIntent.findUnique({ where: { id: noNet.intent.id } });
    assert.strictEqual(noNetFresh.payoutSettlementStatus, "PENDING");

    const mainSkip = await rec.applyPaystackSettlementRow(settlementRow(ids.main), applyOpts("none"));
    assert.strictEqual(mainSkip.skipped, true);
    assert.strictEqual(mainSkip.reason, "main_account_settlement_ignored");

    const ACCT_OLD = acctFor("old");
    const ACCT_NEW = acctFor("new");
    const hist = await seedIntent({ suffix: `${suffix}hist`, acct: ACCT_OLD });
    fixtures.push(hist);
    const provider = await prisma.provider.create({
      data: {
        userId: hist.providerUser.id,
        businessName: `Amt Hist ${suffix}`,
        approved: true,
        profileCompleted: true,
      },
    });
    await prisma.providerWithdrawalProfile.create({
      data: {
        id: randomUUID(),
        providerId: provider.id,
        bankName: "FNB",
        accountHolder: "Provider",
        accountNumber: "enc:test-amt-hist",
        branchCode: "enc:test-250655",
        accountType: "CHEQUE",
        verificationStatus: "VERIFIED",
        gatewayProvider: "PAYSTACK",
        gatewayRecipientId: ACCT_NEW,
        gatewayProfileStatus: "ACTIVE",
        gatewayProfilePayload: { domain: process.env.PAYSTACK_MODE || "test", subaccount_code: ACCT_NEW },
        isActive: true,
      },
    });
    const histNewSkip = await rec.applyPaystackSettlementRow(settlementRow(ids.histNew), applyOpts(ACCT_NEW));
    assert.strictEqual(histNewSkip.skipped, true);
    const histPending = await prisma.paymentIntent.findUnique({ where: { id: hist.intent.id } });
    assert.strictEqual(histPending.payoutSettlementStatus, "PENDING");
    const histOk = await rec.applyPaystackSettlementRow(settlementRow(ids.hist), applyOpts(ACCT_OLD));
    assert.strictEqual(histOk.skipped, false);
    assert.strictEqual(histOk.matchingStrategy, "settlement_amount_single");
    const histSettled = await prisma.paymentIntent.findUnique({ where: { id: hist.intent.id } });
    assert.strictEqual(histSettled.payoutSettlementStatus, "SETTLED");
    const histRow = await prisma.gatewayPayoutSettlement.findUnique({
      where: { gateway_externalSettlementId: { gateway: "PAYSTACK", externalSettlementId: String(ids.hist) } },
    });
    assert.strictEqual(histRow.subaccountCode, ACCT_OLD);
    await prisma.providerWithdrawalProfile.deleteMany({ where: { providerId: provider.id } }).catch(() => {});
    await prisma.provider.deleteMany({ where: { id: provider.id } }).catch(() => {});

    console.log("paystack.settlementAmountFallback.test.js: all passed");
  } finally {
    paystack.listSettlements = origList;
    paystack.getSettlementTransactions = origTx;
    paystack.getSettlementTransactionsViaExport = origExport;
    paystack.resolvePaystackSubaccountId = origResolve;
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
