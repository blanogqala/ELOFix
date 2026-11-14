function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function intentRefundRank(intent) {
  const kind = String(intent?.kind || "");
  if (kind === "MATERIAL_ORDER" || kind === "JOB_STORE_ORDER") return 0;
  if (kind === "DELIVERY_FEE") return 1;
  return 2;
}

/**
 * A captured charge belongs to this material order when the intent is linked
 * directly, or when a job-store checkout stored this order id in its metadata.
 */
function intentPaysForMaterialOrder(intent, orderId) {
  if (!intent || !orderId) return false;
  const target = String(orderId);
  if (intent.materialOrderId && String(intent.materialOrderId) === target) return true;
  const payload = intent.gatewayPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return String(payload.orderId || "") === target;
}

/**
 * Split a cancel refund across the charges that actually captured it.
 * Materials are refunded before a separate delivery-fee charge.
 * The total never exceeds the requested refund or any single captured amount.
 */
function allocateMaterialCancelRefunds(intents, refundAmount) {
  const budget = roundMoney(refundAmount);
  if (!(budget > 0)) return [];
  const ordered = [...(Array.isArray(intents) ? intents : [])].sort(
    (a, b) => intentRefundRank(a) - intentRefundRank(b) || String(a?.id || "").localeCompare(String(b?.id || ""))
  );
  let remaining = budget;
  const slices = [];
  for (const intent of ordered) {
    if (!(remaining > 0.009) || !intent?.id) continue;
    const cap = roundMoney(intent.amount);
    if (!(cap > 0)) continue;
    const amount = roundMoney(Math.min(cap, remaining));
    if (!(amount > 0)) continue;
    slices.push({ intentId: String(intent.id), amount });
    remaining = roundMoney(remaining - amount);
  }
  return slices;
}

module.exports = {
  roundMoney,
  intentPaysForMaterialOrder,
  allocateMaterialCancelRefunds,
};
