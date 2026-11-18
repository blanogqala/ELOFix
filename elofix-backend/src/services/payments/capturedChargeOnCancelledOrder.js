/**
 * A checkout can be captured after the order is already cancelled:
 * the customer pays, then cancels while the intent is still pending,
 * and the gateway webhook arrives later.
 * Those captures must be refunded, not applied to the cancelled order.
 */

function materialOrderAcceptsCapturedPayment(order) {
  if (!order) return true;
  const fulfillment = String(order.fulfillmentStatus || "").toUpperCase();
  const paymentStatus = String(order.paymentStatus || "").toLowerCase();
  if (fulfillment === "CANCELLED") return false;
  if (paymentStatus === "refunded") return false;
  return true;
}

/**
 * payForStoreMaterials errors that mean the batch can no longer take money.
 * "already" / "paid" stay idempotent success. "no longer active" is a rejected
 * or provider-cancelled list: the capture must be refunded, not swallowed.
 */
function jobStorePayErrorDisposition(error) {
  const status = Number(error?.statusCode);
  const msg = String(error?.message || "");
  if (status !== 400) return "throw";
  if (/no longer active/i.test(msg)) return "refund_captured_charge";
  if (/already|paid/i.test(msg)) return "already_applied";
  return "throw";
}

/** Gateway refund outcomes that mean this capture will not be settled again. */
function capturedRefundRetrySucceeded(result) {
  if (!result || typeof result !== "object") return false;
  if (result.ok || result.pending) return true;
  const msg = String(result.message || "");
  return /no_paid_intent|nothing_left_to_refund/i.test(msg);
}

module.exports = {
  materialOrderAcceptsCapturedPayment,
  jobStorePayErrorDisposition,
  capturedRefundRetrySucceeded,
};
