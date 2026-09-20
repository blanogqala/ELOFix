/**
 * Read-only Paystack settlement diagnostic. Does not move money or persist settlement links.
 * Run: node tests/paystack.settlementDiagnostic.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const paystack = require("../src/services/payments/paystack.gateway");
const rec = require("../src/services/payments/paystack.settlementReconcile.service");
const diagnostic = require("../src/services/payments/paystack.settlementDiagnostic.service");
const { sanitizePaystackFailure } = require("../src/services/payments/paystack.client");
const { mapPaystackSettlementApiStatus } = require("../src/services/payments/payoutTransparency.util");

const ACCT = "ACCT_DIAG_OK";
const ACCT_OTHER = "ACCT_DIAG_OTHER";

async function seedIntent(suffix, extras = {}) {
  const customer = await prisma.user.create({
    data: {
      email: `diag.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `diag.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      title: "Diag job",
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
      merchantReference: extras.merchantReference || `EF-DIAG-${suffix}`.toUpperCase(),
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
      payoutSettlementStatus: extras.payoutSettlementStatus || "PENDING",
      payoutSettlementId: extras.payoutSettlementId || null,
      processorFeeAmount: extras.processorFeeAmount === undefined ? new Prisma.Decimal("2.82") : extras.processorFeeAmount,
      expectedBankSettlementAmount:
        extras.expectedBankSettlementAmount === undefined
          ? new Prisma.Decimal("43.68")
          : extras.expectedBankSettlementAmount,
      gatewayPayload: extras.gatewayPayload || {
        subaccount: extras.subaccount || ACCT,
        bearer: "subaccount",
        fees: 282,
        fees_split: { paystack: 282 },
        status: "success",
        gateway_response: "Approved",
        message: "Approved",
      },
    },
  });
  return { customer, providerUser, job, intent };
}

async function cleanup(fix) {
  if (!fix) return;
  if (fix.intent?.id) {
    await prisma.paymentIntent
      .update({ where: { id: fix.intent.id }, data: { payoutSettlementId: null } })
      .catch(() => {});
    await prisma.gatewayPayoutSettlementItem.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { id: fix.intent.id } }).catch(() => {});
  }
  if (fix.job?.id) await prisma.job.deleteMany({ where: { id: fix.job.id } }).catch(() => {});
  if (fix.customer && fix.providerUser) {
    await prisma.user.deleteMany({ where: { id: { in: [fix.customer.id, fix.providerUser.id] } } }).catch(() => {});
  }
}

async function assertUnchangedAmounts(intentId, before) {
  const after = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  assert.strictEqual(Number(after.amount), Number(before.amount));
  assert.strictEqual(Number(after.commissionAmount), Number(before.commissionAmount));
  assert.strictEqual(Number(after.recipientAmount), Number(before.recipientAmount));
  assert.strictEqual(Number(after.processorFeeAmount), Number(before.processorFeeAmount));
  assert.strictEqual(after.payoutSettlementStatus, before.payoutSettlementStatus);
  assert.strictEqual(after.payoutSettlementId, before.payoutSettlementId);
  assert.strictEqual(after.state, before.state);
}

async function run() {
  const origResolve = paystack.resolvePaystackSubaccountId;
  const origList = paystack.listSettlements;
  const origTx = paystack.getSettlementTransactions;
  const origExport = paystack.getSettlementTransactionsViaExport;
  const origConfigured = paystack.isConfigured;
  const origApply = rec.applyPaystackSettlementRow;
  let applyCalls = 0;
  rec.applyPaystackSettlementRow = async (...args) => {
    applyCalls += 1;
    return origApply(...args);
  };
  paystack.isConfigured = () => true;
  paystack.resolvePaystackSubaccountId = async (code) => {
    if (String(code).toUpperCase() === ACCT.toUpperCase()) return 991122;
    if (String(code).toUpperCase() === ACCT_OTHER.toUpperCase()) return 334455;
    return null;
  };
  let exportCalls = 0;
  paystack.getSettlementTransactionsViaExport = async () => {
    exportCalls += 1;
    return { transactions: [] };
  };

  const fixtures = [];
  try {
    assert.strictEqual(mapPaystackSettlementApiStatus("success"), "SETTLED");
    assert.strictEqual(mapPaystackSettlementApiStatus("pending"), "PENDING");
    assert.strictEqual(mapPaystackSettlementApiStatus("paid"), null);

    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/payments/paystack.gateway.js"),
      "utf8"
    );
    assert.match(src, /does not rely on this webhook for payout finality/i);
    assert.match(src, /settlement\.\*/i);

    const sanitized = sanitizePaystackFailure(
      {
        message: "Invalid key Bearer sk_live_abc123 Authorization: secret",
        httpStatus: 401,
        code: "PAYSTACK_HTTP",
        paystack: {
          message: "Invalid key",
          code: "invalid_key",
          httpStatus: 401,
          keyPrefix: "sk_live_",
        },
      },
      "subaccount_fetch_failed"
    );
    assert.strictEqual(sanitized.category, "subaccount_fetch_failed");
    assert.strictEqual(sanitized.httpStatus, 401);
    assert.strictEqual(sanitized.paystackErrorCode, "invalid_key");
    assert.doesNotMatch(JSON.stringify(sanitized), /sk_live_abc123/i);
    assert.doesNotMatch(JSON.stringify(sanitized), /Authorization/i);
    assert.doesNotMatch(JSON.stringify(sanitized), /keyPrefix/i);

    const zero = await seedIntent("zero");
    fixtures.push(zero);
    paystack.listSettlements = async (opts = {}) => {
      assert.strictEqual(Number(opts.subaccount), 991122);
      return { settlements: [], meta: { pageCount: 1 } };
    };
    const zeroOut = await diagnostic.diagnosePaystackSettlement({
      reference: zero.intent.merchantReference,
    });
    assert.strictEqual(zeroOut.resolvedNumericSubaccountId, 991122);
    assert.strictEqual(zeroOut.historicalSubaccountCode, ACCT);
    assert.strictEqual(zeroOut.skipReason, "no_settlements_returned");
    assert.strictEqual(zeroOut.reconciliationDecision, "skipped");
    assert.deepStrictEqual(zeroOut.settlements, []);
    await assertUnchangedAmounts(zero.intent.id, zero.intent);

    const successFix = await seedIntent("success");
    fixtures.push(successFix);
    paystack.listSettlements = async () => ({
      settlements: [
        {
          id: 7001,
          status: "success",
          settlement_date: "2026-09-18",
          currency: "ZAR",
          subaccount: ACCT,
        },
      ],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => ({
      transactions: [
        {
          reference: successFix.intent.merchantReference,
          status: "success",
          fees: 282,
          bearer: "subaccount",
          fees_split: { paystack: 282 },
        },
      ],
    });
    const successOut = await diagnostic.diagnosePaystackSettlement({
      paymentIntentId: successFix.intent.id,
    });
    assert.strictEqual(successOut.settlements[0].status, "success");
    assert.strictEqual(successOut.settlements[0].mappedStatus, "SETTLED");
    assert.strictEqual(successOut.settlements[0].referenceMatched, true);
    assert.strictEqual(successOut.settlements[0].matchedReference, successFix.intent.merchantReference);
    assert.strictEqual(successOut.settlements[0].matchedTransactionStatus, "success");
    assert.strictEqual(successOut.settlements[0].matchedTransactionFee, 2.82);
    assert.strictEqual(successOut.skipReason, "match_found_not_linked");
    assert.strictEqual(successOut.reconciliationDecision, "skipped");
    assert.strictEqual(successOut.settlements[0].transactionSource, "settlement_api");
    assert.strictEqual(successOut.settlements[0].fallbackAttempted, false);
    assert.strictEqual(exportCalls, 0, "export fallback must not run when settlement transactions exist");
    await assertUnchangedAmounts(successFix.intent.id, successFix.intent);

    const pendingFix = await seedIntent("pending");
    fixtures.push(pendingFix);
    paystack.listSettlements = async () => ({
      settlements: [{ id: 7002, status: "pending", settlement_date: "2026-09-18", currency: "ZAR" }],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => ({
      transactions: [{ reference: pendingFix.intent.merchantReference, status: "success", fees: 282 }],
    });
    const pendingOut = await diagnostic.diagnosePaystackSettlement({
      reference: pendingFix.intent.merchantReference,
    });
    assert.strictEqual(pendingOut.settlements[0].mappedStatus, "PENDING");
    assert.strictEqual(pendingOut.settlements[0].referenceMatched, true);
    assert.strictEqual(pendingOut.skipReason, "match_found_not_linked");

    const missingRef = await seedIntent("noref");
    fixtures.push(missingRef);
    paystack.listSettlements = async () => ({
      settlements: [{ id: 7003, status: "success", settlement_date: "2026-09-18", currency: "ZAR" }],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => ({
      transactions: [{ reference: "EF-OTHER-REF", status: "success", fees: 282 }],
    });
    const missingOut = await diagnostic.diagnosePaystackSettlement({
      reference: missingRef.intent.merchantReference,
    });
    assert.strictEqual(missingOut.settlements[0].referenceMatched, false);
    assert.strictEqual(missingOut.skipReason, "reference_not_found");

    const noTxn = await seedIntent("notxn");
    fixtures.push(noTxn);
    paystack.listSettlements = async () => ({
      settlements: [{ id: 7004, status: "success", settlement_date: "2026-09-18", currency: "ZAR" }],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => ({ transactions: [] });
    exportCalls = 0;
    const noTxnOut = await diagnostic.diagnosePaystackSettlement({
      reference: noTxn.intent.merchantReference,
    });
    assert.strictEqual(noTxnOut.settlements[0].transactionCount, 0);
    assert.strictEqual(noTxnOut.settlements[0].primaryTransactionCount, 0);
    assert.strictEqual(noTxnOut.settlements[0].fallbackAttempted, true);
    assert.strictEqual(noTxnOut.settlements[0].fallbackTransactionCount, 0);
    assert.strictEqual(noTxnOut.settlements[0].referenceMatched, false);
    assert.strictEqual(noTxnOut.skipReason, "no_transactions");
    assert.ok(exportCalls >= 1);

    const mismatch = await seedIntent("mismatch", { subaccount: ACCT_OTHER });
    fixtures.push(mismatch);
    paystack.listSettlements = async (opts = {}) => {
      assert.strictEqual(Number(opts.subaccount), 334455);
      return { settlements: [], meta: { pageCount: 1 } };
    };
    const mismatchOut = await diagnostic.diagnosePaystackSettlement({
      reference: mismatch.intent.merchantReference,
    });
    assert.strictEqual(mismatchOut.historicalSubaccountCode, ACCT_OTHER);
    assert.strictEqual(mismatchOut.resolvedNumericSubaccountId, 334455);
    assert.strictEqual(mismatchOut.skipReason, "no_settlements_returned");

    const unknown = await seedIntent("paidstatus");
    fixtures.push(unknown);
    paystack.listSettlements = async () => ({
      settlements: [{ id: 7005, status: "paid", settlement_date: "2026-09-18", currency: "ZAR" }],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => ({
      transactions: [{ reference: unknown.intent.merchantReference, status: "success", fees: 282 }],
    });
    const unknownOut = await diagnostic.diagnosePaystackSettlement({
      reference: unknown.intent.merchantReference,
    });
    assert.strictEqual(unknownOut.settlements[0].referenceMatched, true);
    assert.strictEqual(unknownOut.settlements[0].mappedStatus, null);
    assert.strictEqual(unknownOut.skipReason, "unknown_settlement_status");

    const apiFail = await seedIntent("api4xx");
    fixtures.push(apiFail);
    paystack.listSettlements = async () => {
      const err = new Error("Invalid key");
      err.httpStatus = 401;
      err.code = "PAYSTACK_HTTP";
      err.paystack = { message: "Invalid key", code: "invalid_key", httpStatus: 401, keyPrefix: "sk_live_" };
      throw err;
    };
    const apiOut = await diagnostic.diagnosePaystackSettlement({
      reference: apiFail.intent.merchantReference,
    });
    assert.strictEqual(apiOut.skipReason, "API_error");
    assert.strictEqual(apiOut.apiError.category, "settlement_list_failed");
    assert.strictEqual(apiOut.apiError.httpStatus, 401);
    assert.strictEqual(apiOut.apiError.paystackErrorCode, "invalid_key");
    assert.doesNotMatch(JSON.stringify(apiOut), /sk_live_/);
    await assertUnchangedAmounts(apiFail.intent.id, apiFail.intent);

    const txnFail = await seedIntent("txn5xx");
    fixtures.push(txnFail);
    paystack.listSettlements = async () => ({
      settlements: [{ id: 7006, status: "success", settlement_date: "2026-09-18", currency: "ZAR" }],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => {
      const err = new Error("upstream");
      err.httpStatus = 500;
      err.paystack = { message: "upstream", httpStatus: 500 };
      throw err;
    };
    const txnOut = await diagnostic.diagnosePaystackSettlement({
      reference: txnFail.intent.merchantReference,
    });
    assert.strictEqual(txnOut.skipReason, "API_error");
    assert.strictEqual(txnOut.settlements[0].apiError.category, "settlement_transactions_failed");
    assert.strictEqual(txnOut.settlements[0].apiError.httpStatus, 500);

    const exportFix = await seedIntent("exportok");
    fixtures.push(exportFix);
    paystack.listSettlements = async () => ({
      settlements: [{ id: 7007, status: "success", settlement_date: "2026-09-15", currency: "ZAR" }],
      meta: { pageCount: 1 },
    });
    paystack.getSettlementTransactions = async () => ({ transactions: [] });
    paystack.getSettlementTransactionsViaExport = async () => ({
      transactions: [
        {
          reference: exportFix.intent.merchantReference,
          status: "success",
          fees: 999999,
          amount: 5000,
          bearer: "subaccount",
          fees_split: { paystack: 999999 },
        },
      ],
    });
    const exportOut = await diagnostic.diagnosePaystackSettlement({
      reference: exportFix.intent.merchantReference,
    });
    assert.strictEqual(exportOut.settlements[0].primaryTransactionCount, 0);
    assert.strictEqual(exportOut.settlements[0].fallbackAttempted, true);
    assert.strictEqual(exportOut.settlements[0].fallbackTransactionCount, 1);
    assert.strictEqual(exportOut.settlements[0].transactionSource, "transaction_export");
    assert.strictEqual(exportOut.settlements[0].referenceMatched, true);
    assert.strictEqual(exportOut.settlements[0].mappedStatus, "SETTLED");
    assert.strictEqual(exportOut.settlements[0].matchedTransactionFee, 2.82);
    const dumped = JSON.stringify(exportOut);
    assert.doesNotMatch(dumped, /authorization/i);
    assert.doesNotMatch(dumped, /account_number/i);
    assert.doesNotMatch(dumped, /cvv/i);
    assert.doesNotMatch(dumped, /files\.paystack\.co/i);
    await assertUnchangedAmounts(exportFix.intent.id, exportFix.intent);

    const exportNoFee = await seedIntent("exportnofee", {
      processorFeeAmount: null,
      expectedBankSettlementAmount: null,
      gatewayPayload: { subaccount: ACCT, bearer: "subaccount" },
    });
    fixtures.push(exportNoFee);
    paystack.getSettlementTransactionsViaExport = async () => ({
      transactions: [{ reference: exportNoFee.intent.merchantReference, status: "success", fees: 282 }],
    });
    const exportNoFeeOut = await diagnostic.diagnosePaystackSettlement({
      reference: exportNoFee.intent.merchantReference,
    });
    assert.strictEqual(exportNoFeeOut.settlements[0].referenceMatched, true);
    assert.strictEqual(exportNoFeeOut.settlements[0].transactionSource, "transaction_export");
    assert.strictEqual(exportNoFeeOut.settlements[0].matchedTransactionFee, null);
    await assertUnchangedAmounts(exportNoFee.intent.id, exportNoFee.intent);

    const exportMiss = await seedIntent("exportmiss");
    fixtures.push(exportMiss);
    paystack.getSettlementTransactionsViaExport = async () => ({
      transactions: [{ reference: "EF-OTHER-EXPORT", status: "success", fees: 282 }],
    });
    const exportMissOut = await diagnostic.diagnosePaystackSettlement({
      reference: exportMiss.intent.merchantReference,
    });
    assert.strictEqual(exportMissOut.settlements[0].referenceMatched, false);
    assert.strictEqual(exportMissOut.skipReason, "reference_not_found");

    const exportFail = await seedIntent("exportfail");
    fixtures.push(exportFail);
    paystack.getSettlementTransactionsViaExport = async () => {
      const err = new Error("export failed");
      err.httpStatus = 502;
      err.paystack = { message: "export failed", httpStatus: 502 };
      throw err;
    };
    const exportFailOut = await diagnostic.diagnosePaystackSettlement({
      reference: exportFail.intent.merchantReference,
    });
    assert.strictEqual(exportFailOut.skipReason, "API_error");
    assert.strictEqual(exportFailOut.settlements[0].fallbackAttempted, true);
    assert.strictEqual(exportFailOut.settlements[0].apiError.category, "transaction_export_failed");
    assert.doesNotMatch(JSON.stringify(exportFailOut), /Authorization/i);

    assert.strictEqual(applyCalls, 0, "diagnostic must never apply settlement rows");

    const listed = await rec.listSettlementsForSubaccountDetailed(paystack, {
      subaccount: ACCT,
      from: "2026-09-01",
      to: "2026-09-20",
    });
    assert.strictEqual(listed.numericId, 991122);

    console.log("paystack.settlementDiagnostic.test.js: all passed");
  } finally {
    rec.applyPaystackSettlementRow = origApply;
    paystack.resolvePaystackSubaccountId = origResolve;
    paystack.listSettlements = origList;
    paystack.getSettlementTransactions = origTx;
    paystack.getSettlementTransactionsViaExport = origExport;
    paystack.isConfigured = origConfigured;
    for (const fix of fixtures.reverse()) {
      await cleanup(fix);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
