const AppError = require("./AppError");

const REFUND_BLOCKS_DELETE_MSG =
  "This job cannot be removed until the pending refund is fully settled.";

const IN_FLIGHT_CUSTOMER_REFUND_STATUSES = new Set([
  "READY",
  "REFUND_READY",
  "REFUND_REQUESTED",
  "REFUND_PROCESSING",
  "REFUND_MANUAL_ACTION_REQUIRED",
  "REFUND_FAILED",
]);

const LEGACY_PENDING_REFUND_STATUSES = new Set([
  "recorded",
  "pending",
  "partial_pending_recovery",
  "pending_manual_gateway",
]);

function isRefundUnsettled(meta) {
  const refund = meta?.refund && typeof meta.refund === "object" ? meta.refund : {};
  const pendingRefund = Number(refund.pendingRefund) || 0;
  const providerDebtAdded = Number(refund.providerDebtAdded) || 0;
  const customerRefundStatus = String(refund.customerRefundStatus || "").trim().toUpperCase();
  const legacyStatus = String(refund.status || refund.kind || "").trim().toLowerCase();

  if (pendingRefund > 0) return true;
  if (IN_FLIGHT_CUSTOMER_REFUND_STATUSES.has(customerRefundStatus)) return true;
  if (LEGACY_PENDING_REFUND_STATUSES.has(legacyStatus)) return true;
  if (providerDebtAdded > 0) return true;
  return false;
}

function assertRefundSettledForDelete(meta) {
  if (isRefundUnsettled(meta)) {
    throw new AppError(REFUND_BLOCKS_DELETE_MSG, 400);
  }
}

module.exports = {
  REFUND_BLOCKS_DELETE_MSG,
  isRefundUnsettled,
  assertRefundSettledForDelete,
};
