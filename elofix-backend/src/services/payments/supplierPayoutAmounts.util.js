const SUPPLIER_RECIPIENT_KINDS = new Set(["MATERIAL_ORDER", "JOB_STORE_ORDER", "DELIVERY_FEE"]);
const MATERIALS_SUPPLIER_KINDS = new Set(["MATERIAL_ORDER", "JOB_STORE_ORDER"]);

function positiveMajor(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isSupplierRecipientKind(kind) {
  return SUPPLIER_RECIPIENT_KINDS.has(String(kind || "").trim().toUpperCase());
}

/**
 * Recipient gross for supplier marketplace payouts.
 * 1. positive PaymentIntent.recipientAmount
 * 2. authoritative linked MaterialOrder.supplierEarning (materials kinds only)
 * 3. otherwise fail closed
 *
 * Never uses browser metadata. Never invents a Paystack fee.
 */
function resolveSupplierRecipientGrossMajor(intent) {
  const kind = String(intent?.kind || "").trim().toUpperCase();
  if (!isSupplierRecipientKind(kind)) {
    return positiveMajor(intent?.recipientAmount);
  }
  const recipient = positiveMajor(intent?.recipientAmount);
  if (recipient != null) return recipient;
  if (!MATERIALS_SUPPLIER_KINDS.has(kind)) return null;
  return positiveMajor(intent?.materialOrder?.supplierEarning);
}

module.exports = {
  SUPPLIER_RECIPIENT_KINDS,
  MATERIALS_SUPPLIER_KINDS,
  positiveMajor,
  isSupplierRecipientKind,
  resolveSupplierRecipientGrossMajor,
};
