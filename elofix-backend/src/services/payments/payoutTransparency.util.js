const { Prisma } = require("@prisma/client");
const { toCents, fromCents, computeExpectedBankSettlement } = require("./money.util");
const { isMarketplaceSplitKind, isRepaymentKind } = require("./paystack.payload");

const MARKETPLACE_KINDS = new Set(["LABOR", "MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"]);
const ACCOUNT_BEARERS = new Set(["account", "merchant", "account-merchant"]);

function numericOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeProvider(value) {
  return String(value || "").trim().toUpperCase();
}

function toMajorDecimal(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(fromCents(toCents(n)).toFixed(2));
}

function majorOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function subunitFeeToMajor(feeCents) {
  if (feeCents == null || feeCents < 0) return null;
  return new Prisma.Decimal(fromCents(Math.round(feeCents)).toFixed(2));
}

function persistedProcessorFeeOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(fromCents(toCents(n)).toFixed(2));
}

/**
 * EloFix marketplace Paystack charges use bearer=subaccount.
 * Main-account / merchant-bearer fees must never be applied to a recipient.
 */
function recipientBearsPaystackFee(evidence, intent) {
  const bearer = String(evidence?.bearer || "").trim().toLowerCase();
  if (ACCOUNT_BEARERS.has(bearer)) return false;
  if (bearer === "subaccount") return true;
  if (!intent) return false;
  if (normalizeProvider(intent.provider) !== "PAYSTACK") return false;
  const kind = String(intent.kind || "").trim().toUpperCase();
  if (isRepaymentKind(kind) || !isMarketplaceSplitKind(kind)) return false;
  return true;
}

function feeFromFeesSplitPaystack(evidence) {
  const feesSplit = objectOrNull(evidence?.fees_split);
  if (!feesSplit) return null;
  return subunitFeeToMajor(numericOrNull(feesSplit.paystack));
}

function feeFromTransactionFeesField(evidence) {
  return subunitFeeToMajor(numericOrNull(evidence?.fees));
}

/**
 * Authoritative Paystack fee charged to the recipient (bearer=subaccount).
 * Uses exact Paystack-reported subunits. Never invents a percentage formula.
 *
 * Precedence inside stored/verify/settlement evidence:
 * 1. fees_split.paystack
 * 2. transaction `fees`
 *
 * @param {object|null} evidence gatewayPayload / verify raw / settlement txn
 * @param {object|null} [intent]
 * @returns {Prisma.Decimal|null} major-unit fee or null
 */
function processorFeeFromPaystackEvidence(evidence, intent = null) {
  const src = objectOrNull(evidence) || {};
  if (!recipientBearsPaystackFee(src, intent)) return null;
  return feeFromFeesSplitPaystack(src) ?? feeFromTransactionFeesField(src);
}

function feeFromSettlementTransaction(txn, intent = null) {
  const src = objectOrNull(txn) || {};
  const evidence = {
    bearer: src.bearer || (intent ? "subaccount" : src.bearer),
    fees_split: src.fees_split,
    fees: src.fees,
  };
  if (src.bearer) evidence.bearer = String(src.bearer).trim().toLowerCase();
  return processorFeeFromPaystackEvidence(evidence, intent);
}

/**
 * Suggested fee precedence:
 * 1. persisted processorFeeAmount
 * 2. fees_split.paystack
 * 3. stored/verify/settlement transaction `fees` under marketplace bearer=subaccount
 */
function resolveAuthoritativeProcessorFee({
  intent = null,
  evidence = null,
  verifyRaw = null,
  settlementTxn = null,
} = {}) {
  const existing = persistedProcessorFeeOrNull(intent?.processorFeeAmount);
  if (existing != null) return existing;
  const fromEvidence = processorFeeFromPaystackEvidence(evidence || intent?.gatewayPayload, intent);
  if (fromEvidence != null) return fromEvidence;
  const fromVerify = processorFeeFromPaystackEvidence(verifyRaw, intent);
  if (fromVerify != null) return fromVerify;
  if (settlementTxn) {
    const fromSettlement = feeFromSettlementTransaction(settlementTxn, intent);
    if (fromSettlement != null) return fromSettlement;
  }
  return null;
}

function initialPayoutStatusForPaidIntent(intent) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (isRepaymentKind(kind) || !MARKETPLACE_KINDS.has(kind)) return "NOT_APPLICABLE";
  if (!isMarketplaceSplitKind(kind)) return "NOT_APPLICABLE";
  if (normalizeProvider(intent?.provider) !== "PAYSTACK") return "NOT_SUPPORTED";
  return "PENDING";
}

function recipientTypeFromIntent(intent) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER") return "SUPPLIER_BRANCH";
  if (kind === "DELIVERY_FEE") return "COURIER";
  return "PROVIDER";
}

/** Branch staff payout dots are scoped to this branch only. */
function resolvePayoutStaffNotifyBranchId(intent, materialOrder) {
  if (recipientTypeFromIntent(intent) !== "SUPPLIER_BRANCH") return null;
  const fromIntent = String(intent?.branchId || "").trim();
  if (fromIntent) return fromIntent;
  const fromOrder = String(materialOrder?.branchId || "").trim();
  return fromOrder || null;
}

/**
 * Build additive payout columns for a newly PAID intent. Does not touch commission/recipient.
 * Charge success is not Paystack payout processing.
 */
function payoutColumnsForPaidIntent(intent, evidence) {
  const status = initialPayoutStatusForPaidIntent(intent);
  if (status !== "PENDING") {
    return {
      processorFeeAmount: null,
      expectedBankSettlementAmount: null,
      payoutSettlementStatus: status,
    };
  }
  const fee = resolveAuthoritativeProcessorFee({ intent, evidence });
  const net = computeExpectedBankSettlement(intent.recipientAmount, fee);
  return {
    processorFeeAmount: net.processorFeeAmount,
    expectedBankSettlementAmount: net.expectedBankSettlementAmount,
    payoutSettlementStatus: "PENDING",
  };
}

function toPublicPayoutBreakdown(intent, extras = {}) {
  if (!intent) return null;
  const status = String(intent.payoutSettlementStatus || extras.payoutSettlementStatus || "NOT_APPLICABLE");
  return {
    paymentState: String(intent.state || ""),
    gateway: normalizeProvider(intent.provider),
    customerAmount: majorOrNull(intent.amount) ?? 0,
    commissionAmount: majorOrNull(intent.commissionAmount) ?? 0,
    recipientGrossShare: majorOrNull(intent.recipientAmount) ?? 0,
    processorFeeAmount: majorOrNull(intent.processorFeeAmount),
    expectedBankSettlementAmount: majorOrNull(intent.expectedBankSettlementAmount),
    payoutSettlementStatus: status,
    payoutSettlementId: intent.payoutSettlementId || extras.payoutSettlementId || null,
    payoutSettledAt: extras.payoutSettledAt || extras.settledAt || null,
    gatewayReference: extras.gatewayReference || intent.merchantReference || null,
    externalSettlementId: extras.externalSettlementId || null,
  };
}

function mapPaystackSettlementApiStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "paid") {
    console.warn(
      "[paystack-settlement] unknown Settlement API status 'paid' — not mapping dashboard/charge Paid to SETTLED"
    );
    return null;
  }
  if (s === "success" || s === "successful" || s === "successfull") return "SETTLED";
  if (s === "pending") return "PENDING";
  if (s === "processing" || s === "ongoing" || s === "in_progress") return "PROCESSING";
  if (s === "failed" || s === "failure") return "FAILED";
  if (s === "reversed" || s === "reversal") return "REVERSED";
  return null;
}

function shouldRepairFalseChargeTimeProcessing(intent) {
  if (!intent) return false;
  if (normalizeProvider(intent.provider) !== "PAYSTACK") return false;
  if (String(intent.state || "").trim().toUpperCase() !== "PAID") return false;
  if (!isMarketplaceSplitKind(intent.kind)) return false;
  if (String(intent.payoutSettlementStatus || "").trim().toUpperCase() !== "PROCESSING") return false;
  if (intent.payoutSettlementId) return false;
  return true;
}

module.exports = {
  processorFeeFromPaystackEvidence,
  feeFromSettlementTransaction,
  resolveAuthoritativeProcessorFee,
  initialPayoutStatusForPaidIntent,
  recipientTypeFromIntent,
  resolvePayoutStaffNotifyBranchId,
  payoutColumnsForPaidIntent,
  toPublicPayoutBreakdown,
  mapPaystackSettlementApiStatus,
  shouldRepairFalseChargeTimeProcessing,
  normalizeProvider,
  toMajorDecimal,
  majorOrNull,
};
