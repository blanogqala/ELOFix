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

function grossToNetLaborRefund(grossAmount, laborGross) {
  const cap = Math.max(0, Number(laborGross) || 0);
  const gross = Math.min(Math.max(0, Number(grossAmount) || 0), cap);
  const maxNet = roundMoney(cap * 0.93);
  return roundMoney(Math.min(gross * 0.93, maxNet));
}

function disputeGrossToLaborNet(action, amount, job, meta) {
  const laborGross = laborGrossFromJob(job, meta);
  const maxNetLabor = roundMoney(laborGross * 0.93);
  if (action === "FULL_REFUND") return maxNetLabor;
  const gross = Math.max(0, Number(amount) || 0);
  return roundMoney(Math.min(grossToNetLaborRefund(gross, laborGross), maxNetLabor));
}

function classifyGatewayRefundResult(result) {
  if (!result) return { manualOnly: false, success: false, failed: false };
  const manualOnly =
    result.reason === "refund_not_supported" || result.supported === false;
  const success = Boolean(result.ok);
  const failed = !manualOnly && !success && result.reason !== "zero_amount" && result.reason !== "no_intent";
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
  grossToNetLaborRefund,
  disputeGrossToLaborNet,
  classifyGatewayRefundResult,
  resolveRefundStatusAfterGateway,
};
