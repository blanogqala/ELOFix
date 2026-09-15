const { Prisma } = require("@prisma/client");
const { toCents, fromCents, computeExpectedBankSettlement } = require("./money.util");
const { isMarketplaceSplitKind, isRepaymentKind } = require("./paystack.payload");

const MARKETPLACE_KINDS = new Set(["LABOR", "MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"]);

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

/**
 * Authoritative Paystack fee charged to the recipient (bearer=subaccount).
 * fees_split.paystack is in Paystack subunits (cents). Do not invent a formula.
 *
 * @param {object|null} evidence gatewayPayload / verify raw
 * @returns {Prisma.Decimal|null} major-unit fee or null
 */
function processorFeeFromPaystackEvidence(evidence) {
  const src = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence : {};
  const bearer = String(src.bearer || "").trim().toLowerCase();
  if (bearer !== "subaccount") return null;
  const feesSplit =
    src.fees_split && typeof src.fees_split === "object" && !Array.isArray(src.fees_split)
      ? src.fees_split
      : null;
  const feeCents = numericOrNull(feesSplit?.paystack);
  if (feeCents == null || feeCents < 0) return null;
  return new Prisma.Decimal(fromCents(Math.round(feeCents)).toFixed(2));
}

function initialPayoutStatusForPaidIntent(intent) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (isRepaymentKind(kind) || !MARKETPLACE_KINDS.has(kind)) return "NOT_APPLICABLE";
  if (!isMarketplaceSplitKind(kind)) return "NOT_APPLICABLE";
  if (normalizeProvider(intent?.provider) !== "PAYSTACK") return "NOT_SUPPORTED";
  return "PROCESSING";
}

function recipientTypeFromIntent(intent) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER") return "SUPPLIER_BRANCH";
  if (kind === "DELIVERY_FEE") return "COURIER";
  return "PROVIDER";
}

/**
 * Build additive payout columns for a newly PAID intent. Does not touch commission/recipient.
 */
function payoutColumnsForPaidIntent(intent, evidence) {
  const status = initialPayoutStatusForPaidIntent(intent);
  if (status !== "PROCESSING") {
    return {
      processorFeeAmount: null,
      expectedBankSettlementAmount: null,
      payoutSettlementStatus: status,
    };
  }
  const fee = processorFeeFromPaystackEvidence(evidence);
  const net = computeExpectedBankSettlement(intent.recipientAmount, fee);
  return {
    processorFeeAmount: net.processorFeeAmount,
    expectedBankSettlementAmount: net.expectedBankSettlementAmount,
    payoutSettlementStatus: "PROCESSING",
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
  if (s === "success" || s === "successful" || s === "successfull") return "SETTLED";
  if (s === "pending") return "PENDING";
  if (s === "processing" || s === "ongoing" || s === "in_progress") return "PROCESSING";
  if (s === "failed" || s === "failure") return "FAILED";
  if (s === "reversed" || s === "reversal") return "REVERSED";
  return null;
}

module.exports = {
  processorFeeFromPaystackEvidence,
  initialPayoutStatusForPaidIntent,
  recipientTypeFromIntent,
  payoutColumnsForPaidIntent,
  toPublicPayoutBreakdown,
  mapPaystackSettlementApiStatus,
  normalizeProvider,
  toMajorDecimal,
  majorOrNull,
};
