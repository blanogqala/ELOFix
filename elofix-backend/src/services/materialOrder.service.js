const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");

function normalizeDeliveryStatus(status) {
  const allowed = ["SelfCollect", "PendingApproval", "Approved", "Rejected", "Cancelled", "InProgress", "Delivered"];
  return allowed.includes(status) ? status : "Processing";
}

function normalizeOrder(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const delivery = input.delivery || {};
  const materialsTotal = Number(input.materialsTotal || 0);
  const deliveryFee = Number(delivery.fee || 0);
  return {
    id: randomUUID(),
    userId: String(input.userId || ""),
    storeId: String(input.storeId || ""),
    storeName: String(input.storeName || "Store"),
    items,
    deliveryType:
      delivery.type === "SELF" ? "SELF" : delivery.type === "STORE" ? "STORE_DELIVERY" : "DELIVERY_PROVIDER",
    deliveryProviderId: delivery.providerId || undefined,
    deliveryFee,
    total: materialsTotal + deliveryFee,
    paymentStatus: "paid",
    deliveryStatus:
      delivery.status === "Delivered" ? "delivered" : delivery.status === "InProgress" ? "out_for_delivery" : "processing",
    delivery: {
      type: delivery.type || "SELF",
      status: normalizeDeliveryStatus(delivery.status),
      providerId: delivery.providerId || undefined,
      fee: deliveryFee,
    },
    payment: { materialsPaid: true, deliveryPaid: false },
    invoiceId: `INV-MAT-${Date.now()}`,
    deliveryInvoiceId: undefined,
    createdAt: new Date().toISOString(),
  };
}

async function createMaterialOrder(params) {
  const order = normalizeOrder(params || {});
  await prisma.materialOrder.create({
    data: {
      id: order.id,
      userId: order.userId,
      payload: order,
    },
  });
  return order;
}

async function getMaterialOrders(userId) {
  const rows = await prisma.materialOrder.findMany({
    where: { userId: String(userId) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => (r.payload && typeof r.payload === "object" ? r.payload : {}));
}

async function getMaterialOrderById(orderId) {
  const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!row || !row.payload || typeof row.payload !== "object") return null;
  return row.payload;
}

async function updateMaterialOrderDelivery(orderId, updates = {}) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      const current = row.payload;
      const nextDelivery = {
        ...(current.delivery || {}),
        ...(updates || {}),
        status: updates.status ? normalizeDeliveryStatus(updates.status) : current.delivery?.status,
      };
      const next = {
        ...current,
        delivery: nextDelivery,
        deliveryType:
          nextDelivery.type === "SELF"
            ? "SELF"
            : nextDelivery.type === "STORE"
              ? "STORE_DELIVERY"
              : "DELIVERY_PROVIDER",
        deliveryProviderId: nextDelivery.providerId || undefined,
        deliveryFee: Number(nextDelivery.fee || current.deliveryFee || 0),
        deliveryStatus:
          nextDelivery.status === "Delivered"
            ? "delivered"
            : nextDelivery.status === "InProgress"
              ? "out_for_delivery"
              : "processing",
      };
      await tx.materialOrder.update({
        where: { id: orderId },
        data: { payload: next },
      });
      return next;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );
}

async function approveMaterialOrderDelivery(orderId) {
  return updateMaterialOrderDelivery(orderId, { status: "Approved" });
}

async function rejectMaterialOrderDelivery(orderId) {
  return updateMaterialOrderDelivery(orderId, { status: "Rejected" });
}

async function payMaterialOrderDelivery(orderId, cardLast4, fee) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      const current = row.payload;
      const safeFee = Number(fee || current.deliveryFee || 0);
      const updated = {
        ...current,
        deliveryFee: safeFee,
        deliveryStatus: "processing",
        payment: { ...(current.payment || {}), materialsPaid: true, deliveryPaid: true },
        delivery: { ...(current.delivery || {}), fee: safeFee, status: "Processing" },
        deliveryInvoiceId: `INV-DEL-${Date.now()}`,
      };
      await tx.materialOrder.update({
        where: { id: orderId },
        data: { payload: updated },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );
}

async function updateMaterialOrderDeliveryStatus(orderId, status) {
  let mapped = "Processing";
  if (status === "delivered") mapped = "Delivered";
  else if (status === "out_for_delivery") mapped = "InProgress";
  return updateMaterialOrderDelivery(orderId, { status: mapped });
}

module.exports = {
  createMaterialOrder,
  getMaterialOrders,
  getMaterialOrderById,
  updateMaterialOrderDelivery,
  approveMaterialOrderDelivery,
  rejectMaterialOrderDelivery,
  payMaterialOrderDelivery,
  updateMaterialOrderDeliveryStatus,
};
