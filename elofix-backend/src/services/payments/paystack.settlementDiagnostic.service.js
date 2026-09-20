const AppError = require("../../utils/AppError");
const prisma = require("../../config/prisma");
const { sanitizePaystackFailure } = require("./paystack.client");
const {
  mapPaystackSettlementApiStatus,
  resolveAuthoritativeProcessorFee,
  majorOrNull,
} = require("./payoutTransparency.util");
const { safePaystackSubaccountCode } = require("./paystack.payload");
const rec = require("./paystack.settlementReconcile.service");
const {
  settlementFinancialFields,
  settlementMatchAmountSubunits,
  decideAmountFallback,
} = require("./paystack.settlementAmountMatch");

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
  const rowReasons = settlements.map((row) => row.skipReason).filter(Boolean);
  const priority = [
    "API_error",
    "ambiguous_amount_match",
    "recipient_scope_mismatch",
    "missing_recipient_net",
    "payment_after_settlement",
    "amount_mismatch",
    "no_transactions_and_no_amount",
    "no_transactions",
  ];
  for (const reason of priority) {
    if (rowReasons.includes(reason)) return reason;
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
  if (settlements.length > 0 && settlements.every((row) => row.transactionCount === 0 && !row.apiError)) {
    return "no_transactions_and_no_amount";
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
    const fields = settlementFinancialFields(row);
    const scanned = {
      settlementId,
      status,
      settlementDate: row?.settlement_date || row?.paid_at || null,
      currency: row?.currency != null ? String(row.currency) : null,
      totalAmount: fields.totalAmount,
      effectiveAmount: fields.effectiveAmount,
      totalFees: fields.totalFees,
      totalProcessed: fields.totalProcessed,
      transactionCount: 0,
      primaryTransactionCount: 0,
      fallbackAttempted: false,
      fallbackTransactionCount: 0,
      transactionSource: "settlement_api",
      referenceMatched: false,
      matchingStrategy: "none",
      candidateIntentIds: [],
      candidateNetAmounts: [],
      matchedIntentIds: [],
      skipReason: null,
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
      scanned.matchingStrategy = "reference";
      scanned.matchedIntentIds = [intent.id];
      scanned.matchedReference = intent.merchantReference;
      scanned.matchedTransactionStatus = txnStatus(match);
      const fee = resolveAuthoritativeProcessorFee({
        intent,
        evidence: intent.gatewayPayload,
        settlementTxn: fetched?.source === "transaction_export" ? null : match,
      });
      scanned.matchedTransactionFee = majorOrNull(fee);
    } else if (transactions.length === 0 && !scanned.apiError) {
      const targetCents = settlementMatchAmountSubunits(row);
      const decision = await diagnoseAmountFallback({
        intent,
        historicalSubaccountCode,
        scanned,
        targetCents,
      });
      scanned.matchingStrategy = decision.matchingStrategy;
      scanned.candidateIntentIds = decision.candidateIntentIds;
      scanned.candidateNetAmounts = decision.candidateNetAmounts;
      scanned.matchedIntentIds = decision.matchedIntentIds;
      scanned.skipReason = decision.skipReason;
      if (decision.thisIntentMatched) {
        anyMatch = true;
        if (mapped) matchedMappedStatus = mapped;
      }
    } else if (transactions.length === 0 && scanned.apiError) {
      scanned.matchingStrategy = "none";
      scanned.skipReason = "API_error";
    } else {
      scanned.matchingStrategy = "none";
      scanned.skipReason = "reference_not_found";
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

async function diagnoseAmountFallback({ intent, historicalSubaccountCode, scanned, targetCents }) {
  const empty = {
    matchingStrategy: "none",
    candidateIntentIds: [],
    candidateNetAmounts: [],
    matchedIntentIds: [],
    skipReason: "no_transactions_and_no_amount",
    thisIntentMatched: false,
  };
  if (!historicalSubaccountCode) {
    return { ...empty, skipReason: "recipient_scope_mismatch" };
  }
  if (targetCents == null || !scanned.settlementDate || !scanned.currency) {
    return empty;
  }
  const collected = await rec.collectAmountFallbackCandidates({
    trustedSubaccount: historicalSubaccountCode,
    currency: scanned.currency,
    settlementDate: scanned.settlementDate,
    existingSettlementId: null,
  });
  const decision = decideAmountFallback({
    collected,
    targetCents,
    hasSettlementDate: Boolean(scanned.settlementDate),
    hasCurrency: Boolean(scanned.currency),
  });
  const matchedIds = (decision.intents || []).map((row) => row.id);
  const thisIntentMatched = matchedIds.includes(intent.id);
  let skipReason = decision.skipReason;
  if (decision.matched && !thisIntentMatched) skipReason = "amount_mismatch";
  if (decision.matched && thisIntentMatched) skipReason = null;
  return {
    matchingStrategy: decision.matchingStrategy || "none",
    candidateIntentIds: (collected.eligible || []).map((row) => row.intent.id),
    candidateNetAmounts: (collected.eligible || []).map((row) => row.netCents),
    matchedIntentIds: matchedIds,
    skipReason,
    thisIntentMatched,
  };
}

module.exports = {
  diagnosePaystackSettlement,
  diagnosticWindow,
};
