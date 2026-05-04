const materialOrderService = require("../services/materialOrder.service");
const jobService = require("../services/job.service");
const supplierService = require("../services/supplier.service");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const { materialOrderBelongsToSupplierStore } = require("../utils/materialOrderSupplier.util");

async function findMaterialOrderOrNull(orderId) {
  return prisma.materialOrder.findUnique({ where: { id: String(orderId || "") } });
}

async function assertCanReadMaterialOrder(req, orderId) {
  const row = await findMaterialOrderOrNull(orderId);
  if (!row) return null;
  if (req.user.role === "ADMIN") return row;
  if (String(row.userId) === String(req.user.userId)) return row;
  if (req.user.role === "SUPPLIER") {
    const sup = await supplierService.findSupplierRecordByUserId(req.user.userId);
    if (sup && materialOrderBelongsToSupplierStore(row, sup.id)) return row;
  }
  throw new AppError("Forbidden", 403);
}

async function assertCanMutateCustomerDelivery(req, orderId) {
  const row = await findMaterialOrderOrNull(orderId);
  if (!row) {
    throw new AppError("Material order not found", 404);
  }
  if (req.user.role === "ADMIN" || String(row.userId) === String(req.user.userId)) {
    return row;
  }
  throw new AppError("Forbidden", 403);
}

async function listOrdersQuery(req, res) {
  const supplierIdQ = req.query.supplierId;
  const status = req.query.status;
  if (req.user.role === "ADMIN") {
    if (supplierIdQ) {
      const orders = await materialOrderService.listMaterialOrdersBySupplierIdsForAdmin([
        String(supplierIdQ),
      ]);
      return res.json({ success: true, orders });
    }
    const orders = await materialOrderService.listAllMaterialOrdersForAdmin();
    return res.json({ success: true, orders });
  }
  if (req.user.role === "SUPPLIER") {
    const row = await supplierService.findSupplierRecordByUserId(req.user.userId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Supplier profile missing" });
    }
    const orders = await materialOrderService.listMaterialOrdersBySupplier(row.id, {
      fulfillmentStatus: status,
    });
    return res.json({ success: true, orders });
  }
  return res.status(403).json({ success: false, message: "Forbidden" });
}

async function getMaterialOrders(req, res) {
  const userId = String(req.query.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && String(userId) !== String(req.user.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const orders = await materialOrderService.getMaterialOrders(userId);
  res.json({ success: true, orders });
}

async function getAllMaterialOrdersForUser(req, res) {
  const userId = String(req.query.userId || req.user.userId);
  if (req.user.role !== "ADMIN" && String(userId) !== String(req.user.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const [orders, jobs] = await Promise.all([
    materialOrderService.getMaterialOrders(userId),
    jobService.getJobsForCustomerId(userId),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const fulfillmentLabel = (raw) => {
    const u = String(raw || "PENDING").toUpperCase();
    if (u === "PENDING") return "Awaiting supplier";
    if (u === "ACCEPTED") return "Accepted";
    if (u === "PREPARING") return "Preparing";
    if (u === "READY") return "Ready";
    if (u === "OUT_FOR_DELIVERY") return "Out for delivery";
    if (u === "COMPLETED") return "Delivered";
    if (u === "FAILED") return "Failed";
    if (u === "DELAYED") return "Delayed";
    if (u === "CANCELLED") return "Cancelled";
    return u;
  };

  const mapped = orders.map((order) => {
    const jobId = order.jobId != null && String(order.jobId).trim() !== "" ? String(order.jobId) : null;
    const job = jobId ? jobById.get(jobId) : null;
    const fulfillment = String(order.fulfillmentStatus || "PENDING").toUpperCase();
    const legacyDeliveryLabel =
      order.deliveryStatus === "delivered"
        ? "Delivered"
        : order.deliveryStatus === "out_for_delivery"
          ? "On the Way"
          : "Processing";

    return {
      id: order.id,
      storeName: order.storeName || "Store",
      jobId,
      jobTitle: job?.title ?? null,
      providerName: job?.provider?.name ?? null,
      itemsCount: (order.items || []).reduce((sum, i) => sum + Number(i.qty || 0), 0),
      total: Number(order.total || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      deliveryTypeLabel:
        order.deliveryType === "SELF" ? "Pickup" : order.deliveryType === "STORE_DELIVERY" ? "Store delivery" : "Courier",
      deliveryStatusLabel: legacyDeliveryLabel,
      fulfillmentStatus: fulfillment,
      fulfillmentStatusLabel: fulfillmentLabel(fulfillment),
      deliveryStatusClassName: "bg-warning/20 text-warning",
      createdAt: order.createdAt,
    };
  });

  mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, orders: mapped });
}

async function getMaterialOrder(req, res) {
  const row = await assertCanReadMaterialOrder(req, req.params.id);
  if (!row) {
    return res.json({ success: true, order: null });
  }
  const order = await materialOrderService.getMaterialOrderById(req.params.id);
  res.json({ success: true, order });
}

async function createMaterialOrder(req, res) {
  const customerId = String(req.body?.userId || "");
  if (req.user.role !== "ADMIN" && String(customerId) !== String(req.user.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const order = await materialOrderService.createMaterialOrder(req.body || {});

  try {
    const storeId = order.storeId ? String(order.storeId) : "";
    if (storeId) await materialOrderService.emitSupplierMaterialOrderCreated(storeId, order.id);
  } catch (_) {
    /* non-fatal socket */
  }

  res.status(201).json({ success: true, order });
}

async function updateMaterialOrderDelivery(req, res) {
  await assertCanMutateCustomerDelivery(req, req.params.id);
  const order = await materialOrderService.updateMaterialOrderDelivery(req.params.id, req.body || {});
  res.json({ success: true, order });
}

async function approveMaterialOrderDelivery(req, res) {
  await assertCanMutateCustomerDelivery(req, req.params.id);
  const order = await materialOrderService.approveMaterialOrderDelivery(req.params.id);
  res.json({ success: true, order });
}

async function rejectMaterialOrderDelivery(req, res) {
  await assertCanMutateCustomerDelivery(req, req.params.id);
  const order = await materialOrderService.rejectMaterialOrderDelivery(req.params.id);
  res.json({ success: true, order });
}

async function payMaterialOrderDelivery(req, res) {
  await assertCanMutateCustomerDelivery(req, req.params.id);
  const order = await materialOrderService.payMaterialOrderDelivery(req.params.id, req.body?.cardLast4, req.body?.fee);
  res.json({ success: true, order });
}

async function updateMaterialOrderDeliveryStatus(req, res) {
  await assertCanMutateCustomerDelivery(req, req.params.id);
  const order = await materialOrderService.updateMaterialOrderDeliveryStatus(req.params.id, req.body?.status);
  res.json({ success: true, order });
}

async function patchProviderFulfillment(req, res) {
  const order = await materialOrderService.updateMaterialOrderFulfillmentByProvider(
    req.params.id,
    req.user.userId,
    req.body?.status
  );
  res.json({ success: true, order });
}

async function confirmDeliveryReceipt(req, res) {
  const order = await materialOrderService.confirmDeliveryReceipt(req.params.id, req.user.userId);
  res.json({ success: true, order });
}

module.exports = {
  listOrdersQuery,
  getMaterialOrders,
  getAllMaterialOrdersForUser,
  getMaterialOrder,
  createMaterialOrder,
  updateMaterialOrderDelivery,
  approveMaterialOrderDelivery,
  rejectMaterialOrderDelivery,
  payMaterialOrderDelivery,
  updateMaterialOrderDeliveryStatus,
  patchProviderFulfillment,
  confirmDeliveryReceipt,
};
