/**
 * Decide what a checkout retry may do with an existing PaymentIntent.
 *
 * Webhooks bind a captured charge by merchantReference. Replacing that
 * reference while the gateway still has the charge (or has already captured
 * it) drops the payment. Failed and cancelled attempts are safe to rotate.
 *
 * @returns {"rotate"|"preserve"|"settle"|"abort"}
 */
function decideInFlightIntentReuse({
  state,
  provider,
  verifyState = null,
  verifyHttpStatus = null,
} = {}) {
  const st = String(state || "").toUpperCase();
  if (st !== "PENDING" && st !== "PROCESSING") return "rotate";
  if (String(provider || "").toUpperCase() !== "PAYSTACK") return "preserve";
  if (Number(verifyHttpStatus) === 404) return "preserve";
  const verified = verifyState == null ? "" : String(verifyState).toUpperCase();
  if (!verified) return "abort";
  if (verified === "PAID") return "settle";
  if (verified === "FAILED" || verified === "CANCELLED") return "rotate";
  return "preserve";
}

module.exports = { decideInFlightIntentReuse };
