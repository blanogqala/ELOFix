const materialOrderService = require("../services/materialOrder.service");
const jobService = require("../services/job.service");
const supplierService = require("../services/supplier.service");

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
  const jobStoreOrders = jobs
    .flatMap((job) =>
      (job.storeOrders || []).map((storeOrder) => ({
        id: storeOrder.orderId,
        storeName:
          storeOrder.storeName || job.materials?.find((m) => m.supplierId === storeOrder.storeId)?.supplierName || "Store",
        itemsCount: (storeOrder.items || []).reduce((sum, i) => sum + Number(i.qty || 0), 0),
        total:
          (storeOrder.items || []).reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.unitPrice || 0), 0) +
          Number(storeOrder.deliveryFee || 0),
        deliveryFee: Number(storeOrder.deliveryFee || 0),
        deliveryTypeLabel:
          storeOrder.deliveryType === "SELF" ? "Self" : storeOrder.deliveryType === "STORE" ? "Store" : "Provider",
        deliveryStatusLabel: storeOrder.deliveryStatus || "Processing",
        deliveryStatusClassName: "bg-warning/20 text-warning",
        createdAt: storeOrder.createdAt,
      }))
    );
  const standalone = orders.map((order) => ({
    id: order.id,
    storeName: order.storeName,
    itemsCount: (order.items || []).reduce((sum, i) => sum + Number(i.qty || 0), 0),
    total: Number(order.total || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    deliveryTypeLabel:
      order.deliveryType === "SELF" ? "Self" : order.deliveryType === "STORE_DELIVERY" ? "Store" : "Provider",
    deliveryStatusLabel:
      order.deliveryStatus === "delivered"
        ? "Delivered"
        : order.deliveryStatus === "out_for_delivery"
          ? "On the Way"
          : "Processing",
    deliveryStatusClassName: "bg-warning/20 text-warning",
    createdAt: order.createdAt,
  }));
  const merged = [...standalone, ...jobStoreOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ success: true, orders: merged });
}

async function getMaterialOrder(req, res) {
  const order = await materialOrderService.getMaterialOrderById(req.params.id);
  if (!order) {
    return res.json({ success: true, order: null });
  }
  if (req.user.role === "SUPPLIER") {
    const sup = await supplierService.findSupplierRecordByUserId(req.user.userId);
    const sid = String(order.storeId || order.supplierId || "");
    if (!sup || !sid || String(sup.id) !== sid) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
  } else if (req.user.role !== "ADMIN" && String(order.userId) !== String(req.user.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
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
  const order = await materialOrderService.updateMaterialOrderDelivery(req.params.id, req.body || {});
  res.json({ success: true, order });
}

async function approveMaterialOrderDelivery(req, res) {
  const order = await materialOrderService.approveMaterialOrderDelivery(req.params.id);
  res.json({ success: true, order });
}

async function rejectMaterialOrderDelivery(req, res) {
  const order = await materialOrderService.rejectMaterialOrderDelivery(req.params.id);
  res.json({ success: true, order });
}

async function payMaterialOrderDelivery(req, res) {
  const order = await materialOrderService.payMaterialOrderDelivery(req.params.id, req.body?.cardLast4, req.body?.fee);
  res.json({ success: true, order });
}

async function updateMaterialOrderDeliveryStatus(req, res) {
  const order = await materialOrderService.updateMaterialOrderDeliveryStatus(req.params.id, req.body?.status);
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
};
