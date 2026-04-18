const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const { readState, updateState } = require("./jsonStore.service");

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
  await updateState((state) => {
    state.materialOrders = [...(state.materialOrders || []), order];
    return state;
  });
  return order;
}

async function getMaterialOrders(userId) {
  const state = await readState();
  return (state.materialOrders || []).filter((o) => o.userId === userId);
}

async function getMaterialOrderById(orderId) {
  const state = await readState();
  return (state.materialOrders || []).find((o) => o.id === orderId) || null;
}

async function updateMaterialOrderDelivery(orderId, updates = {}) {
  let updated = null;
  await updateState((state) => {
    const orders = state.materialOrders || [];
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx < 0) throw new AppError("Material order not found", 404);
    const current = orders[idx];
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
    orders[idx] = next;
    state.materialOrders = orders;
    updated = next;
    return state;
  });
  return updated;
}

async function approveMaterialOrderDelivery(orderId) {
  return updateMaterialOrderDelivery(orderId, { status: "Approved" });
}

async function rejectMaterialOrderDelivery(orderId) {
  return updateMaterialOrderDelivery(orderId, { status: "Rejected" });
}

async function payMaterialOrderDelivery(orderId, cardLast4, fee) {
  let updated = null;
  await updateState((state) => {
    const orders = state.materialOrders || [];
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx < 0) throw new AppError("Material order not found", 404);
    const current = orders[idx];
    const safeFee = Number(fee || current.deliveryFee || 0);
    updated = {
      ...current,
      deliveryFee: safeFee,
      deliveryStatus: "processing",
      payment: { ...(current.payment || {}), materialsPaid: true, deliveryPaid: true },
      delivery: { ...(current.delivery || {}), fee: safeFee, status: "Processing" },
      deliveryInvoiceId: `INV-DEL-${Date.now()}`,
    };
    orders[idx] = updated;
    state.materialOrders = orders;
    return state;
  });
  return updated;
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
