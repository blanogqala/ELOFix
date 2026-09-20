const AppError = require("../../utils/AppError");
const prisma = require("../../config/prisma");
const { sanitizePaystackFailure } = require("./paystack.client");
const {
  mapPaystackSettlementApiStatus,
  feeFromSettlementTransaction,
  majorOrNull,
} = require("./payoutTransparency.util");
const { safePaystackSubaccountCode } = require("./paystack.payload");
const rec = require("./paystack.settlementReconcile.service");

function ymd(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function diagnosticWindow(intent, lookbackDays) {
  const days = Number.isFinite(Number(lookbackDays))
    ? Math.min(365, Math.max(1, Number(lookbackDays)))
    : 90;
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const paid = intent?.paidAt || intent?.createdAt;
  if (paid) {
    const paidFrom = new Date(paid);
    if (!Number.isNaN(paidFrom.getTime())) {
      paidFrom.setDate(paidFrom.getDate() - 1);
      if (paidFrom < fromDate) return { from: ymd(paidFrom), to: ymd(toDate) };
    }
  }
  return { from: ymd(fromDate), to: ymd(toDate) };
}

function txnReference(txn) {
  return String(txn?.reference || txn?.transaction?.reference || "").trim();
}

function txnStatus(txn) {
  const raw = txn?.status || txn?.transaction?.status || null;
  return raw != null ? String(raw) : null;
}

function decideSkipReason({
  storedId,
  listed,
  settlements,
  anyMatch,
  matchedMappedStatus,
}) {
  if (storedId) return null;
  if (listed?.error) return "API_error";
  if (listed?.skipReason === "subaccount_mismatch") return "subaccount_mismatch";
  if (!listed?.rows?.length) return listed?.skipReason || "no_settlements_returned";
  if (anyMatch && !matchedMappedStatus) return "unknown_settlement_status";
  if (anyMatch) return "match_found_not_linked";
  if (settlements.length > 0 && settlements.every((row) => row.transactionCount === 0 && !row.apiError)) {
    return "no_transactions";
  }
  if (
    settlements.some(
      (row) =>
        row.apiError?.category === "settlement_transactions_failed" ||
        row.apiError?.category === "transaction_export_failed"
    )
  ) {
    return "API_error";
  }
  return "reference_not_found";
}

/**
 * Read-only Paystack settlement diagnostic. Never mutates payments, refunds, or settlements.
 */
async function diagnosePaystackSettlement({
  reference,
  paymentIntentId,
  lookbackDays,
  maxPages,
} = {}) {
  const ref = String(reference || "").trim();
  const intentId = String(paymentIntentId || "").trim();
  if (!ref && !intentId) {
    throw new AppError("reference or paymentIntentId is required", 400, "DIAGNOSTIC_QUERY_REQUIRED");
  }

  const intent = await prisma.paymentIntent.findFirst({
    where: intentId
      ? { id: intentId }
      : { merchantReference: ref },
    select: {
      id: true,
      merchantReference: true,
      provider: true,
      kind: true,
      state: true,
      payoutSettlementStatus: true,
      payoutSettlementId: true,
      gatewayPayload: true,
      paidAt: true,
      createdAt: true,
      amount: true,
      commissionAmount: true,
      recipientAmount: true,
      processorFeeAmount: true,
    },
  });
  if (!intent) {
    throw new AppError("Payment intent not found", 404, "PAYMENT_INTENT_NOT_FOUND");
  }

  const historicalSubaccountCode = safePaystackSubaccountCode(intent.gatewayPayload);
  const window = diagnosticWindow(intent, lookbackDays);
  const pageCap = Number.isFinite(Number(maxPages)) ? Math.min(10, Math.max(1, Number(maxPages))) : 5;

  const base = {
    paymentIntentId: intent.id,
    merchantReference: intent.merchantReference,
    paymentState: intent.state,
    storedPayoutSettlementStatus: intent.payoutSettlementStatus,
    storedPayoutSettlementId: intent.payoutSettlementId,
    historicalSubaccountCode,
    resolvedNumericSubaccountId: null,
    settlementQuery: { from: window.from, to: window.to, pagesChecked: 0 },
    settlements: [],
    reconciliationDecision: intent.payoutSettlementId ? "linked" : "skipped",
    skipReason: intent.payoutSettlementId ? null : "no_settlements_returned",
    apiError: null,
  };

  if (String(intent.provider || "").toUpperCase() !== "PAYSTACK") {
    return { ...base, skipReason: intent.payoutSettlementId ? null : "reference_not_found" };
  }

  const paystack = require("./paystack.gateway");
  if (typeof paystack.isConfigured === "function" && !paystack.isConfigured()) {
    const apiError = {
      category: "settlement_list_failed",
      httpStatus: null,
      paystackErrorCode: "PAYSTACK_NOT_CONFIGURED",
      message: "Paystack is not configured",
    };
    return {
      ...base,
      skipReason: intent.payoutSettlementId ? null : "API_error",
      apiError,
    };
  }

  const listed = await rec.listSettlementsForSubaccountDetailed(paystack, {
    subaccount: historicalSubaccountCode,
    from: window.from,
    to: window.to,
    maxPages: pageCap,
  });

  base.resolvedNumericSubaccountId = listed.numericId;
  base.settlementQuery = {
    from: listed.from,
    to: listed.to,
    pagesChecked: listed.pagesChecked,
  };

  if (listed.error) {
    return {
      ...base,
      reconciliationDecision: intent.payoutSettlementId ? "linked" : "skipped",
      skipReason: intent.payoutSettlementId ? null : "API_error",
      apiError: listed.error,
    };
  }

  const settlements = [];
  let anyMatch = false;
  let matchedMappedStatus = null;
  let firstTxnApiError = null;

  for (const row of listed.rows || []) {
    const settlementId = row?.id != null ? String(row.id) : null;
    const status = row?.status != null ? String(row.status) : null;
    const mapped = mapPaystackSettlementApiStatus(status);
    const scanned = {
      settlementId,
      status,
      settlementDate: row?.settlement_date || row?.paid_at || null,
      currency: row?.currency != null ? String(row.currency) : null,
      transactionCount: 0,
      primaryTransactionCount: 0,
      fallbackAttempted: false,
      fallbackTransactionCount: 0,
      transactionSource: "settlement_api",
      referenceMatched: false,
      mappedStatus: mapped,
      apiError: null,
    };

    if (!settlementId) {
      settlements.push(scanned);
      continue;
    }

    let fetched;
    try {
      fetched =
        typeof paystack.getAuthoritativeSettlementTransactions === "function"
          ? await paystack.getAuthoritativeSettlementTransactions(settlementId)
          : await paystack.getSettlementTransactions(settlementId);
    } catch (err) {
      scanned.apiError = sanitizePaystackFailure(err, "settlement_transactions_failed");
      if (!firstTxnApiError) firstTxnApiError = scanned.apiError;
      settlements.push(scanned);
      continue;
    }

    const transactions = Array.isArray(fetched?.transactions) ? fetched.transactions : [];
    scanned.primaryTransactionCount =
      fetched?.primaryCount != null ? Number(fetched.primaryCount) : transactions.length;
    scanned.fallbackAttempted = Boolean(fetched?.fallbackAttempted);
    scanned.fallbackTransactionCount =
      fetched?.fallbackTransactionCount != null ? Number(fetched.fallbackTransactionCount) : 0;
    scanned.transactionSource = fetched?.source || "settlement_api";
    scanned.transactionCount = transactions.length;
    if (fetched?.error && transactions.length === 0) {
      scanned.apiError = fetched.error;
      if (!firstTxnApiError) firstTxnApiError = fetched.error;
    }
    const match = transactions.find((txn) => txnReference(txn) === String(intent.merchantReference || "").trim());
    if (match) {
      anyMatch = true;
      if (mapped) matchedMappedStatus = mapped;
      scanned.referenceMatched = true;
      scanned.matchedReference = intent.merchantReference;
      scanned.matchedTransactionStatus = txnStatus(match);
      const fee = feeFromSettlementTransaction(match, intent);
      scanned.matchedTransactionFee = majorOrNull(fee);
    }
    settlements.push(scanned);
  }

  const skipReason = decideSkipReason({
    storedId: intent.payoutSettlementId,
    listed,
    settlements,
    anyMatch,
    matchedMappedStatus,
  });

  return {
    ...base,
    settlements,
    reconciliationDecision: intent.payoutSettlementId ? "linked" : "skipped",
    skipReason,
    apiError: firstTxnApiError && skipReason === "API_error" ? firstTxnApiError : null,
  };
}

module.exports = {
  diagnosePaystackSettlement,
  diagnosticWindow,
};
