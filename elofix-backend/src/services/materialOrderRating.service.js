const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { syncProviderAggregateRating } = require("./providerAggregateRating.service");

async function createMaterialOrderRating({ orderId, customerUserId, rating, comment }) {
  const oid = String(orderId || "").trim();
  if (!oid) {
    throw new AppError("orderId is required", 400);
  }
  const r = Math.round(Number(rating));
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    throw new AppError("rating must be between 1 and 5", 400);
  }

  const order = await prisma.materialOrder.findUnique({ where: { id: oid } });
  if (!order) {
    throw new AppError("Material order not found", 404);
  }
  if (String(order.userId) !== String(customerUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
  if (String(order.fulfillmentStatus || "") !== "COMPLETED") {
    throw new AppError("Order must be completed before rating", 400);
  }
  const pload = order.payload && typeof order.payload === "object" ? order.payload : {};
  if (!pload.deliveryConfirmed) {
    throw new AppError("Confirm delivery receipt before submitting a rating", 400);
  }
  if (!order.jobId) {
    throw new AppError(
      "This order does not include an assigned provider. Ratings apply to provider-delivered shop orders tied to a job.",
      400
    );
  }

  const job = await prisma.job.findUnique({
    where: { id: order.jobId },
    select: { providerId: true },
  });
  if (!job || !job.providerId) {
    throw new AppError("No provider found for this order", 400);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });
  if (!providerRow) {
    throw new AppError("Provider not found", 404);
  }

  const existing = await prisma.materialOrderRating.findUnique({
    where: { orderId: oid },
  });
  if (existing) {
    throw new AppError("You already submitted a rating for this order", 409);
  }

  await prisma.materialOrderRating.create({
    data: {
      id: randomUUID(),
      orderId: oid,
      providerId: providerRow.id,
      rating: r,
      comment: comment != null && String(comment).trim() !== "" ? String(comment).trim() : null,
    },
  });

  await syncProviderAggregateRating(providerRow.id);

  return { orderId: oid, rating: r };
}

module.exports = { createMaterialOrderRating };
