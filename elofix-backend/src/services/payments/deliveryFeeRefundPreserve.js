const REFUNDABLE_CAPTURED_STATES = new Set(["PAID", "PARTIALLY_REFUNDED", "DISPUTED"]);
const IN_FLIGHT_CAPTURE_STATES = new Set(["PENDING", "PROCESSING"]);

function payloadObject(intent) {
  const payload = intent && intent.gatewayPayload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return { ...payload };
  return {};
}

/**
 * A captured delivery-fee charge must stay refundable while a cancellation
 * dispute is open. Detach it from the material order so the customer can pay
 * a new courier, but do not flip it to CANCELLED or clear the gateway id.
 * Sandbox rows with no gateway transaction still cancel so the unique slot frees.
 */
function shouldPreserveCapturedDeliveryFee(intent, preserveCaptured) {
  if (!preserveCaptured || !intent) return false;
  if (String(intent.gatewayTransactionId || "").trim() === "") return false;
  const state = String(intent.state || "").toUpperCase();
  // A charge can still be in flight when the courier cancels. Keep the gateway
  // id so a late success webhook stays refundable instead of being reused away.
  return REFUNDABLE_CAPTURED_STATES.has(state) || IN_FLIGHT_CAPTURE_STATES.has(state);
}

function planDeliveryFeeIntentRelease(intents, options = {}) {
  const preserveCaptured = Boolean(options.preserveCaptured);
  const jobId = options.jobId ? String(options.jobId) : "";
  const materialOrderId = options.materialOrderId ? String(options.materialOrderId) : "";
  const now = options.now instanceof Date ? options.now : new Date();
  return (Array.isArray(intents) ? intents : []).map((intent) => {
    const state = String(intent?.state || "").toUpperCase();
    const preserve =
      shouldPreserveCapturedDeliveryFee(intent, preserveCaptured) ||
      (preserveCaptured && state === "REFUNDED");
    if (preserve) {
      const previous = payloadObject(intent);
      return {
        type: "detach",
        id: intent.id,
        data: {
          materialOrderId: null,
          jobId: intent.jobId || jobId || null,
          gatewayPayload: {
            ...previous,
            detachedMaterialOrderId: materialOrderId || previous.detachedMaterialOrderId || null,
            detachedForRefundReview: true,
          },
        },
      };
    }
    return {
      type: "cancel",
      id: intent.id,
      data: { state: "CANCELLED", cancelledAt: now },
    };
  });
}

/**
 * Labor refunds stay on LABOR intents. Courier delivery is charged as
 * DELIVERY_FEE on the courier job, so that charge is the refund source only
 * when the job has no paid labor intent.
 */
function supplementalRefundKind(laborMatchCount) {
  return Number(laborMatchCount) > 0 ? null : "DELIVERY_FEE";
}

module.exports = {
  shouldPreserveCapturedDeliveryFee,
  planDeliveryFeeIntentRelease,
  supplementalRefundKind,
};
