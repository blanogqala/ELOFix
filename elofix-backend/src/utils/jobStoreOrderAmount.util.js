/**
 * Job-store materials checkout charges item lines only.
 * Courier and branch delivery fees are quoted separately and paid as DELIVERY_FEE.
 * Older intents bundled a persisted delivery fee into the materials charge; settlement
 * still accepts that total so an in-flight payment is not stranded.
 */

function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function positiveFee(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function jobStoreMaterialsTotal(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce(
    (sum, item) => sum + Number(item?.qty || 0) * Number(item?.unitPrice || item?.price || 0),
    0
  );
}

/**
 * Fee totals this code used to add onto the materials charge.
 * Create used `deliveryFee || delivery.fee`. Settlement also fell back to checkout metadata.
 */
function legacyBundledFees(order, metadataFee) {
  const fromCreate = positiveFee(order?.deliveryFee || order?.delivery?.fee || 0);
  const fromSettlement = positiveFee(
    order?.deliveryFee != null ? order.deliveryFee : order?.delivery?.fee || metadataFee || 0
  );
  return [...new Set([fromCreate, fromSettlement].filter((fee) => fee > 0))];
}

function jobStoreChargeTotal(order) {
  return jobStoreMaterialsTotal(order);
}

function jobStorePaidAmountCoversMaterials(intentAmount, order, metadataFee) {
  const materials = jobStoreMaterialsTotal(order);
  if (!(materials > 0)) return false;
  const accepted = [materials, ...legacyBundledFees(order, metadataFee).map((fee) => materials + fee)];
  const paidCents = toCents(intentAmount);
  return accepted.some((expected) => Math.abs(paidCents - toCents(expected)) <= 2);
}

module.exports = {
  jobStoreMaterialsTotal,
  jobStoreChargeTotal,
  jobStorePaidAmountCoversMaterials,
};
