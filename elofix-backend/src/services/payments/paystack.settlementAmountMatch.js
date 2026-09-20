const { toCents, computeExpectedBankSettlement } = require("./money.util");
const { resolveSupplierRecipientGrossMajor } = require("./supplierPayoutAmounts.util");

/**
 * Paystack settlement amounts are integer subunits (cents). Reject non-integers.
 * Never convert majors with floating-point guesses.
 */
function integerSubunits(value) {
  if (value == null || value === "") return null;
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function settlementFinancialFields(row) {
  return {
    totalAmount: integerSubunits(row?.total_amount ?? row?.totalAmount),
    effectiveAmount: integerSubunits(row?.effective_amount ?? row?.effectiveAmount),
    totalFees: integerSubunits(row?.total_fees ?? row?.totalFees),
    totalProcessed: integerSubunits(row?.total_processed ?? row?.totalProcessed),
  };
}

function settlementMatchAmountSubunits(row) {
  const fields = settlementFinancialFields(row);
  if (fields.effectiveAmount != null) return fields.effectiveAmount;
  return fields.totalAmount;
}

/**
 * Recipient net cents for amount fallback.
 * Preferred: persisted expectedBankSettlementAmount.
 * Else: resolved recipient gross − processorFeeAmount only when both are known.
 * Supplier historical fallback: recipientAmount, else MaterialOrder.supplierEarning.
 */
function recipientNetCents(intent) {
  if (intent?.expectedBankSettlementAmount != null && intent.expectedBankSettlementAmount !== "") {
    const cents = toCents(intent.expectedBankSettlementAmount);
    if (Number.isFinite(cents) && cents > 0) return cents;
  }
  const recipientGross = resolveSupplierRecipientGrossMajor(intent);
  if (
    recipientGross != null &&
    intent?.processorFeeAmount != null &&
    intent.processorFeeAmount !== ""
  ) {
    const net = computeExpectedBankSettlement(recipientGross, intent.processorFeeAmount);
    if (net.expectedBankSettlementAmount != null) {
      const cents = toCents(net.expectedBankSettlementAmount);
      if (Number.isFinite(cents) && cents > 0) return cents;
    }
  }
  return null;
}

function ymdUtc(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function paidAtNotAfterSettlement(paidAt, settlementDate) {
  const paid = ymdUtc(paidAt);
  const settled = ymdUtc(settlementDate);
  if (!paid || !settled) return false;
  return paid <= settled;
}

function paidAtMs(value) {
  if (!value) return NaN;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function paidAtTied(a, b) {
  const ta = paidAtMs(a?.paidAt);
  const tb = paidAtMs(b?.paidAt);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return true;
  return ta === tb;
}

function sameIntentIdSet(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  const ids = new Set(left.map((row) => String(row.intent?.id || row.id)));
  for (const row of right) {
    if (!ids.has(String(row.intent?.id || row.id))) return false;
  }
  return true;
}

/**
 * Unique chronological prefix whose nets sum to targetCents.
 * A cut between tied paidAt values is non-deterministic — fail closed.
 */
function uniqueChronologicalPrefix(eligible, targetCents) {
  let sum = 0;
  const matches = [];
  for (let i = 0; i < eligible.length; i += 1) {
    const net = eligible[i].netCents;
    if (net == null) {
      return { ambiguous: false, set: null, skipReason: "missing_recipient_net" };
    }
    sum += net;
    if (sum === targetCents) {
      const cutAmbiguous = i < eligible.length - 1 && paidAtTied(eligible[i], eligible[i + 1]);
      if (cutAmbiguous) {
        return { ambiguous: true, set: null };
      }
      matches.push(eligible.slice(0, i + 1));
    }
    if (sum > targetCents) break;
  }
  if (matches.length > 1) return { ambiguous: true, set: null };
  if (matches.length === 1) return { ambiguous: false, set: matches[0] };
  return { ambiguous: false, set: null };
}

function evaluateSettlementAmountMatch(eligible, targetCents) {
  const rows = Array.isArray(eligible) ? eligible : [];
  if (targetCents == null || !Number.isInteger(targetCents) || targetCents <= 0 || rows.length === 0) {
    return { matchedIntents: [], matchingStrategy: "none", ambiguous: false };
  }

  const singles = rows.filter((row) => row.netCents === targetCents);
  const singleSet = singles.length === 1 ? [singles[0]] : null;
  const prefix = uniqueChronologicalPrefix(rows, targetCents);

  if (prefix.skipReason === "missing_recipient_net") {
    return { matchedIntents: [], matchingStrategy: "none", ambiguous: false, skipReason: "missing_recipient_net" };
  }
  if (prefix.ambiguous) {
    return { matchedIntents: [], matchingStrategy: "none", ambiguous: true };
  }

  const prefixSet = prefix.set;
  if (singleSet && prefixSet && !sameIntentIdSet(singleSet, prefixSet)) {
    return { matchedIntents: [], matchingStrategy: "none", ambiguous: true };
  }
  if (singleSet) {
    return { matchedIntents: singleSet, matchingStrategy: "settlement_amount_single", ambiguous: false };
  }
  if (prefixSet) {
    return {
      matchedIntents: prefixSet,
      matchingStrategy: prefixSet.length === 1 ? "settlement_amount_single" : "settlement_amount_batch",
      ambiguous: false,
    };
  }
  return { matchedIntents: [], matchingStrategy: "none", ambiguous: false };
}

function classifyAmountFallbackSkip(collected) {
  if (!collected) return "no_transactions_and_no_amount";
  if (!collected.scoped || collected.scoped.length === 0) return "recipient_scope_mismatch";
  if (collected.eligible && collected.eligible.length > 0) return "amount_mismatch";
  if (collected.missingNet && collected.missingNet.length > 0) return "missing_recipient_net";
  if (collected.afterSettlement && collected.afterSettlement.length > 0) return "payment_after_settlement";
  if (collected.missingPaidAt && collected.missingPaidAt.length > 0) return "payment_after_settlement";
  if (collected.currencyMismatch && collected.currencyMismatch.length > 0) return "recipient_scope_mismatch";
  return "recipient_scope_mismatch";
}

function decideAmountFallback({ collected, targetCents, hasSettlementDate, hasCurrency } = {}) {
  if (targetCents == null || hasSettlementDate === false || hasCurrency === false) {
    return {
      matched: false,
      skipReason: "no_transactions_and_no_amount",
      matchingStrategy: "none",
      intents: [],
    };
  }
  const eligible = collected?.eligible || [];
  if (eligible.length === 0) {
    return {
      matched: false,
      skipReason: classifyAmountFallbackSkip(collected),
      matchingStrategy: "none",
      intents: [],
    };
  }
  const result = evaluateSettlementAmountMatch(eligible, targetCents);
  if (result.ambiguous) {
    return { matched: false, skipReason: "ambiguous_amount_match", matchingStrategy: "none", intents: [] };
  }
  if (result.skipReason === "missing_recipient_net") {
    return { matched: false, skipReason: "missing_recipient_net", matchingStrategy: "none", intents: [] };
  }
  if (!result.matchedIntents || result.matchedIntents.length === 0) {
    return { matched: false, skipReason: "amount_mismatch", matchingStrategy: "none", intents: [] };
  }
  return {
    matched: true,
    skipReason: null,
    matchingStrategy: result.matchingStrategy,
    intents: result.matchedIntents.map((row) => row.intent),
    matchedRows: result.matchedIntents,
  };
}

function sortSettlementsOldestFirst(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.sort((a, b) => {
    const da = ymdUtc(a?.settlement_date || a?.paid_at) || "9999-12-31";
    const db = ymdUtc(b?.settlement_date || b?.paid_at) || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

module.exports = {
  integerSubunits,
  settlementFinancialFields,
  settlementMatchAmountSubunits,
  recipientNetCents,
  ymdUtc,
  paidAtNotAfterSettlement,
  evaluateSettlementAmountMatch,
  decideAmountFallback,
  classifyAmountFallbackSkip,
  sortSettlementsOldestFirst,
};
