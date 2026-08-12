const EPS = 1e-6;

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function laborGrossFromJob(job, meta) {
  if (job.totalPrice != null && Number(job.totalPrice) > 0) {
    return Number(job.totalPrice);
  }
  if (meta?.servicePrice?.amount != null) {
    return Number(meta.servicePrice.amount);
  }
  return Number(job.price) || 0;
}

function cumulativeRefundedFromMeta(meta) {
  const refund = meta?.refund;
  if (!refund || typeof refund !== "object") return 0;
  return Number(refund.cumulativeCustomerNet ?? refund.amount ?? 0) || 0;
}

/**
 * Sum of successfully settled DEPOSIT + COMPLETION customer payments (authoritative via paymentSummary).
 */
function paidLaborGrossFromJob(job, meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const laborPaid = Boolean(job?.laborPaid) || Boolean(safeMeta.laborPaid);
  if (!laborPaid) return 0;

  if (job?.legacyEscrowV2) {
    if (
      safeMeta.servicePayment &&
      String(safeMeta.servicePayment.status || "").toLowerCase() === "paid"
    ) {
      return Number(safeMeta.servicePayment.amount) || 0;
    }
    return Number(job.price) || 0;
  }

  const paymentModeService = require("../services/payments/paymentMode.service");
  const summary = paymentModeService.buildPaymentSummary(job, safeMeta);
  if (summary && Number(summary.totalPaidByCustomer) > 0) {
    return Number(summary.totalPaidByCustomer) || 0;
  }

  if (
    safeMeta.servicePayment &&
    String(safeMeta.servicePayment.status || "").toLowerCase() === "paid"
  ) {
    return Number(safeMeta.servicePayment.amount) || 0;
  }

  return 0;
}

/**
 * Paid labor still available to refund, expressed as customer gross.
 * Recorded refunds on meta are provider/customer net (paid − 7% commission).
 */
function remainingRefundableLaborGross(job, meta) {
  const paid = paidLaborGrossFromJob(job, meta);
  if (paid <= EPS) return 0;
  const refundedNet = cumulativeRefundedFromMeta(meta);
  if (refundedNet <= EPS) return roundMoney(paid);

  const paidNet = netCourierCancelRefundFromGross(paid);
  const remainingNet = Math.max(0, roundMoney(paidNet - refundedNet));
  if (remainingNet <= EPS) return 0;
  // Inverse of 7% keep-commission so admin caps stay in gross terms.
  return roundMoney(remainingNet / 0.93);
}

function netCourierCancelRefundFromGross(gross) {
  const g = Math.max(0, Number(gross) || 0);
  return roundMoney(g - roundMoney(g * 0.07));
}

function grossToNetLaborRefund(grossAmount, laborGross) {
  const cap = Math.max(0, Number(laborGross) || 0);
  const gross = Math.min(Math.max(0, Number(grossAmount) || 0), cap);
  const maxNet = netCourierCancelRefundFromGross(cap);
  return roundMoney(Math.min(netCourierCancelRefundFromGross(gross), maxNet));
}

/**
 * Convert admin refund action + gross amount into the net labor refund
 * (released deposit/completion − 7% platform commission). EloFix keeps commission.
 */
function disputeGrossToLaborNet(action, amount, job, meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const refundableGross = remainingRefundableLaborGross(job, safeMeta);

  if (action === "FULL_REFUND") {
    if (refundableGross <= 0) return 0;
    return netCourierCancelRefundFromGross(refundableGross);
  }

  const gross = Math.min(Math.max(0, Number(amount) || 0), refundableGross);
  if (gross <= 0) return 0;
  return netCourierCancelRefundFromGross(gross);
}

function classifyGatewayRefundResult(result) {
  if (!result) return { manualOnly: false, success: false, failed: false };
  const manualOnly =
    result.reason === "refund_not_supported" ||
    result.supported === false ||
    result.requiresManualAction === true ||
    result.status === "MANUAL_REQUIRED" ||
    result.message === "refund_not_supported";
  const success = Boolean(result.ok);
  const failed =
    !manualOnly &&
    !success &&
    result.reason !== "zero_amount" &&
    result.reason !== "no_intent" &&
    result.message !== "zero_amount" &&
    result.message !== "no_paid_intent" &&
    result.message !== "nothing_left_to_refund";
  return { manualOnly, success, failed };
}

function resolveRefundStatusAfterGateway({ manualOnly, gatewaySuccess, isFullRefund }) {
  if (gatewaySuccess) return isFullRefund ? "processed" : "partial";
  if (manualOnly) return "pending_manual_gateway";
  return "recorded";
}

module.exports = {
  EPS,
  roundMoney,
  laborGrossFromJob,
  paidLaborGrossFromJob,
  remainingRefundableLaborGross,
  cumulativeRefundedFromMeta,
  netCourierCancelRefundFromGross,
  grossToNetLaborRefund,
  disputeGrossToLaborNet,
  classifyGatewayRefundResult,
  resolveRefundStatusAfterGateway,
};
