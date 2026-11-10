const AppError = require("./AppError");

function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Store checkout cannot be marked settled from the request body.
 * A receipt is accepted only when it is an unattached MATERIAL_ORDER payment
 * for this customer and this materials total. Delivery is collected separately.
 */
function resolveStoreCheckoutPayment({ intent, userId, materialsSubtotal }) {
  if (!intent) {
    return { paymentStatus: "unpaid", materialsPaid: false };
  }
  if (String(intent.state || "") !== "PAID") {
    throw new AppError("A settled material payment is required", 400);
  }
  if (String(intent.userId || "") !== String(userId || "")) {
    throw new AppError("Payment intent does not belong to this customer", 403);
  }
  if (String(intent.kind || "") !== "MATERIAL_ORDER") {
    throw new AppError("Payment intent is not a material order payment", 400);
  }
  if (intent.materialOrderId) {
    throw new AppError("Payment intent is already linked to an order", 400);
  }
  const paidCents = cents(intent.amount);
  const expectedCents = cents(materialsSubtotal);
  if (paidCents == null || expectedCents == null || expectedCents <= 0 || Math.abs(paidCents - expectedCents) > 2) {
    throw new AppError("Payment intent amount does not match this order", 400);
  }
  return { paymentStatus: "paid", materialsPaid: true };
}

module.exports = {
  resolveStoreCheckoutPayment,
};
