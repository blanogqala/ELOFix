const AppError = require("./AppError");

/**
 * Charge total used when a JOB_STORE_ORDER intent is created.
 * Keep this in step with resolveAmountForKind: materials, plus delivery fee when set.
 */
function jobStoreOrderChargeTotal(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const materialsTotal = items.reduce(
    (sum, item) => sum + Number(item?.qty || 0) * Number(item?.unitPrice || item?.price || 0),
    0
  );
  // Same coalescing as paymentIntent.resolveAmountForKind, which priced the receipt.
  const deliveryFee = Number(order?.deliveryFee || order?.delivery?.fee || 0);
  return materialsTotal + (Number.isFinite(deliveryFee) ? deliveryFee : 0);
}

function checkoutMeta(intent) {
  const payload = intent?.gatewayPayload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * A JOB_STORE_ORDER receipt may mark only the store batch it was priced for.
 * Throws when the receipt belongs to another job, customer, store, batch, or amount.
 */
function assertJobStorePaymentIntent(intent, { job, storeId, order }) {
  if (!intent || String(intent.state || "") !== "PAID") {
    throw new AppError("A settled store payment is required", 400);
  }
  if (String(intent.kind || "") !== "JOB_STORE_ORDER" || String(intent.jobId || "") !== String(job?.id || "")) {
    throw new AppError("Payment intent does not match this job", 400);
  }
  if (String(intent.userId || "") !== String(job?.customerId || "")) {
    throw new AppError("Payment intent does not belong to this customer", 403);
  }

  const meta = checkoutMeta(intent);
  const orderIdHint = meta.orderId != null ? String(meta.orderId).trim() : "";
  const supplierIdHint = meta.supplierId != null ? String(meta.supplierId).trim() : "";
  if (!orderIdHint && !supplierIdHint) {
    throw new AppError("Payment intent is not linked to a store order", 400);
  }
  if (orderIdHint && String(order?.orderId || "") !== orderIdHint) {
    throw new AppError("Payment intent does not match this store order", 400);
  }
  if (supplierIdHint) {
    const candidates = new Set(
      [storeId, order?.storeId, order?.supplierId]
        .map((value) => (value != null ? String(value).trim() : ""))
        .filter(Boolean)
    );
    if (!candidates.has(supplierIdHint)) {
      throw new AppError("Payment intent does not match this store", 400);
    }
  }

  const expected = jobStoreOrderChargeTotal(order);
  const paidCents = cents(intent.amount);
  const expectedCents = cents(expected);
  if (paidCents == null || expectedCents == null || Math.abs(paidCents - expectedCents) > 2) {
    throw new AppError("Payment intent amount does not match this store order", 400);
  }
}

module.exports = {
  jobStoreOrderChargeTotal,
  assertJobStorePaymentIntent,
};
