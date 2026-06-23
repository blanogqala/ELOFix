const materialOrderService = require("../services/materialOrder.service");
const jobService = require("../services/job.service");
const supplierService = require("../services/supplier.service");
const prisma = require("../config/prisma");
const { materialOrderBelongsToSupplierStore } = require("../utils/materialOrderSupplier.util");

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
      total: Number(order.finance?.orderGross ?? order.total ?? 0),
      deliveryFee: Number(order.finance?.deliveryFee ?? order.deliveryFee ?? 0),
      deliveryTypeLabel:
        order.deliveryType === "SELF" ? "Pickup" : order.deliveryType === "STORE_DELIVERY" ? "Store delivery" : "Courier",
      deliveryStatusLabel: legacyDeliveryLabel,
      fulfillmentStatus: fulfillment,
      fulfillmentStatusLabel: fulfillmentLabel(fulfillment),
      deliveryStatusClassName: "bg-warning/20 text-warning",
      createdAt: order.createdAt,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
      refundAmount: order.refundAmount != null ? Number(order.refundAmount) : undefined,
      isRefunded:
        fulfillment === "CANCELLED" &&
        Number(order.refundAmount || 0) > 0 &&
        String(order.refundStatus || "").toLowerCase() === "processed",
    };
  });

  mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, orders: mapped });
}

async function getMaterialOrder(req, res) {
  const order = await materialOrderService.getMaterialOrderById(req.params.id);
  if (!order) {
    return res.json({ success: true, order: null });
  }
  if (req.user.role === "SUPPLIER") {
    const sup = await supplierService.findSupplierRecordByUserId(req.user.userId);
    const row = await prisma.materialOrder.findUnique({ where: { id: req.params.id } });
    if (!sup || !row || !(await materialOrderBelongsToSupplierStore(row, sup.id))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
  } else if (req.user.role === "PROVIDER") {
    const row = await prisma.materialOrder.findUnique({ where: { id: req.params.id } });
    const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
    const assigned = materialOrderService.resolveAssignedCourierId(payload);
    if (assigned !== String(req.user.userId)) {
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

async function reportDeliveryIssue(req, res) {
  const order = await materialOrderService.reportDeliveryIssue(req.params.id, req.user.userId, {
    reason: req.body?.reason,
    details: req.body?.details,
  });
  res.json({ success: true, order });
}

async function cancelMaterialOrder(req, res) {
  const reason = req.body?.reason;
  const out = await materialOrderService.cancelMaterialOrderAsCustomer(
    req.params.id,
    req.user.userId,
    reason
  );
  res.json({ success: true, order: out.order, refund: out.refund });
}

async function getDeliveryInbox(req, res) {
  const orders = await materialOrderService.listDeliveryInboxForProvider(req.user.userId);
  res.json({ success: true, orders });
}

async function submitDeliveryQuote(req, res) {
  const order = await materialOrderService.submitDeliveryQuote(req.params.id, req.user.userId, {
    fee: req.body?.fee,
    note: req.body?.note,
  });
  res.json({ success: true, order });
}

async function rejectDeliveryRequest(req, res) {
  const order = await materialOrderService.rejectDeliveryRequestByProvider(
    req.params.id,
    req.user.userId,
    req.body?.reason
  );
  res.json({ success: true, order });
}

async function acceptDeliveryQuote(req, res) {
  const order = await materialOrderService.acceptDeliveryQuote(req.params.id, req.user.userId);
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
  reportDeliveryIssue,
  cancelMaterialOrder,
  getDeliveryInbox,
  submitDeliveryQuote,
  rejectDeliveryRequest,
  acceptDeliveryQuote,
};
