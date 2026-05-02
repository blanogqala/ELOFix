const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const supplierService = require("./supplier.service");
const notificationService = require("./notification.service");
const trackingService = require("./tracking.service");
const {
  payloadBackedSupplierId,
  materialOrderBelongsToSupplierStore,
} = require("../utils/materialOrderSupplier.util");

function emitMaterialOrderFulfillmentToCustomer(userId, payload) {
  try {
    if (!global.io || !userId) return;
    global.io.to(String(userId)).emit("material_order:fulfillment", payload);
  } catch (e) {
    console.error("emitMaterialOrderFulfillmentToCustomer", e);
  }
}

function fulfillmentEnumToBatchStatus(fs) {
  const u = String(fs || "PENDING").toUpperCase();
  const map = {
    PENDING: "pending",
    ACCEPTED: "accepted",
    PREPARING: "preparing",
    READY: "ready",
    OUT_FOR_DELIVERY: "out_for_delivery",
    COMPLETED: "delivered",
    FAILED: "failed",
    DELAYED: "delayed",
    CANCELLED: "cancelled",
  };
  return map[u] || "pending";
}

function deliveryJobTypeToCanonical(dt) {
  const d = String(dt || "SELF").toUpperCase();
  if (d === "SELF") return "pickup";
  return "delivery";
}

function mergeMaterialBatch(payload, row, overrides = {}) {
  const base = payload.materialBatch && typeof payload.materialBatch === "object" ? { ...payload.materialBatch } : {};
  const id = base.id || row.id;
  const supplierId = base.supplierId || row.supplierId || payload.storeId || "";
  const items = Array.isArray(base.items) && base.items.length > 0 ? base.items : (Array.isArray(payload.items) ? payload.items : []);
  const deliveryType =
    base.deliveryType || deliveryJobTypeToCanonical(payload.delivery?.type || payload.deliveryType);
  const nextStatus = overrides.status != null ? overrides.status : fulfillmentEnumToBatchStatus(row.fulfillmentStatus);
  const timestamps = {
    acceptedAt: base.timestamps?.acceptedAt,
    readyAt: base.timestamps?.readyAt,
    pickedUpAt: base.timestamps?.pickedUpAt,
    deliveredAt: base.timestamps?.deliveredAt,
    ...(overrides.timestamps || {}),
  };
  return {
    ...base,
    id,
    supplierId: String(supplierId || ""),
    items,
    status: nextStatus,
    deliveryType,
    pickupAddress: base.pickupAddress != null ? String(base.pickupAddress) : "",
    deliveryAddress: base.deliveryAddress != null ? String(base.deliveryAddress) : "",
    assignedDriverId: base.assignedDriverId || payload.deliveryProviderId || undefined,
    timestamps,
  };
}

async function notifyCustomerFulfillmentStep(row, next) {
  const customerId = row.userId;
  if (!customerId) return;
  const jobId = row.jobId || undefined;
  try {
    if (next === "READY") {
      await notificationService.addNotification({
        userId: customerId,
        jobId,
        type: "material_tracking",
        title: "Materials update",
        message: "Your materials are ready for pickup",
      });
    } else if (next === "OUT_FOR_DELIVERY") {
      await notificationService.addNotification({
        userId: customerId,
        jobId,
        type: "material_tracking",
        title: "Materials update",
        message: "Your materials are on the way",
      });
    } else if (next === "COMPLETED") {
      await notificationService.addNotification({
        userId: customerId,
        jobId,
        type: "material_tracking",
        title: "Materials update",
        message: "Materials delivered successfully",
      });
    } else if (next === "FAILED") {
      await notificationService.addNotification({
        userId: customerId,
        jobId,
        type: "material_tracking",
        title: "Delivery issue",
        message: "Your materials delivery could not be completed",
      });
    } else if (next === "DELAYED") {
      await notificationService.addNotification({
        userId: customerId,
        jobId,
        type: "material_tracking",
        title: "Delivery delayed",
        message: "Your materials delivery has been delayed",
      });
    } else if (next === "CANCELLED") {
      await notificationService.addNotification({
        userId: customerId,
        jobId,
        type: "material_tracking",
        title: "Delivery cancelled",
        message: "Your materials delivery was cancelled",
      });
    }
  } catch (e) {
    console.error("notifyCustomerFulfillmentStep", e);
  }
}

function patchPayloadForFulfillmentDelivery(payload, next) {
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  if (next === "OUT_FOR_DELIVERY") {
    p.delivery = { ...(p.delivery || {}), status: "InProgress" };
    p.deliveryStatus = "out_for_delivery";
  }
  if (next === "COMPLETED") {
    p.delivery = { ...(p.delivery || {}), status: "Delivered" };
    p.deliveryStatus = "delivered";
    p.deliveryConfirmed = false;
  }
  if (next === "FAILED") {
    p.delivery = { ...(p.delivery || {}), status: "Rejected" };
    p.deliveryStatus = "processing";
  }
  if (next === "DELAYED") {
    p.delivery = { ...(p.delivery || {}), status: "InProgress" };
  }
  if (next === "CANCELLED") {
    p.delivery = { ...(p.delivery || {}), status: "Cancelled" };
    p.deliveryStatus = "processing";
  }
  return p;
}

function enrichOrderFromDbRow(row, payload) {
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  if (row.supplierId) p.supplierId = row.supplierId;
  if (row.jobId) p.jobId = row.jobId;
  if (row.providerId) p.providerId = row.providerId;
  if (row.source) p.source = row.source;
  if (row.paymentStatus) p.dbPaymentStatus = row.paymentStatus;
  if (row.fulfillmentStatus) p.fulfillmentStatus = row.fulfillmentStatus;
  if (row.materialsSubtotal != null) p.materialsSubtotal = Number(row.materialsSubtotal);
  if (row.platformCommission != null) p.platformCommission = Number(row.platformCommission);
  if (row.supplierEarning != null) p.supplierEarning = Number(row.supplierEarning);
  return p;
}

function coerceAmt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function normalizeOrder(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const delivery = input.delivery || {};
  const materialsTotal = Number(input.materialsTotal || 0);
  const deliveryFee = Number(delivery.fee || 0);

  const { materialsSubtotal, platformCommission, supplierEarning } = supplierService.splitMaterialsCommission(materialsTotal);
  const storeId = String(input.storeId || "");

  const id = typeof input.id === "string" ? input.id : randomUUID();

  const orderCore = {
    id,
    userId: String(input.userId || ""),
    storeId,
    storeName: String(input.storeName || "Store"),
    items,
    deliveryType:
      delivery.type === "SELF"
        ? "SELF"
        : delivery.type === "STORE"
          ? "STORE_DELIVERY"
          : "DELIVERY_PROVIDER",
    deliveryProviderId: delivery.providerId || undefined,
    deliveryFee,
    total: materialsTotal + deliveryFee,
    paymentStatus: "paid",
    deliveryStatus:
      delivery.status === "Delivered"
        ? "delivered"
        : delivery.status === "InProgress"
          ? "out_for_delivery"
          : "processing",
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
    fulfillmentStatus: "PENDING",
    materialsSubtotal,
    platformCommission,
    supplierEarning,
    jobId: input.jobId ? String(input.jobId) : undefined,
    providerId: input.providerId ? String(input.providerId) : undefined,
    source: input.source === "job_materials" ? "job_materials" : "store_checkout",
    supplierActivity: [{ type: "created", createdAt: new Date().toISOString() }],
    materialBatch: {
      id,
      supplierId: storeId,
      items,
      status: "pending",
      deliveryType: deliveryJobTypeToCanonical(delivery.type || "SELF"),
      pickupAddress: "",
      deliveryAddress: "",
      assignedDriverId: delivery.providerId || undefined,
      timestamps: {},
    },
  };

  const prismaRow = {
    id: orderCore.id,
    userId: orderCore.userId,
    supplierId: storeId || null,
    jobId: input.jobId ? String(input.jobId) : null,
    providerId: input.providerId ? String(input.providerId) : null,
    paymentStatus:
      input.paymentStatus === "unpaid" || input.paymentStatus === "paid"
        ? String(input.paymentStatus)
        : "paid",
    source: input.source === "job_materials" ? "job_materials" : "store_checkout",
    fulfillmentStatus: "PENDING",
    materialsSubtotal: new Prisma.Decimal(materialsSubtotal),
    platformCommission: new Prisma.Decimal(platformCommission),
    supplierEarning: new Prisma.Decimal(supplierEarning),
    payload: orderCore,
  };

  return {
    prismaRow,
    order: orderCore,
  };
}

async function createMaterialOrder(params) {
  const { prismaRow, order } = normalizeOrder(params || {});

  await prisma.materialOrder.create({
    data: {
      id: prismaRow.id,
      userId: prismaRow.userId,
      supplierId: prismaRow.supplierId,
      jobId: prismaRow.jobId,
      providerId: prismaRow.providerId,
      paymentStatus: prismaRow.paymentStatus,
      source: prismaRow.source,
      fulfillmentStatus: prismaRow.fulfillmentStatus,
      materialsSubtotal: prismaRow.materialsSubtotal,
      platformCommission: prismaRow.platformCommission,
      supplierEarning: prismaRow.supplierEarning,
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
  return rows.map((r) =>
    enrichOrderFromDbRow(r, r.payload && typeof r.payload === "object" ? r.payload : {})
  );
}

async function maybeAutoConfirmStaleDelivery(row) {
  if (!row || String(row.fulfillmentStatus || "") !== "COMPLETED") return row;
  const p = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  if (p.deliveryConfirmed === true) return row;
  const batch = p.materialBatch && typeof p.materialBatch === "object" ? p.materialBatch : {};
  const ts = batch.timestamps && batch.timestamps.deliveredAt ? String(batch.timestamps.deliveredAt) : null;
  if (!ts) return row;
  const delivered = new Date(ts).getTime();
  if (!Number.isFinite(delivered) || Date.now() - delivered < 24 * 60 * 60 * 1000) return row;
  const nextPayload = { ...p, deliveryConfirmed: true, deliveryAutoConfirmed: true };
  await prisma.materialOrder.update({ where: { id: row.id }, data: { payload: nextPayload } });
  return { ...row, payload: nextPayload };
}

async function autoConfirmStaleDeliveriesBatch() {
  try {
    const rows = await prisma.materialOrder.findMany({
      where: { fulfillmentStatus: "COMPLETED" },
      take: 300,
      orderBy: { updatedAt: "desc" },
    });
    for (const row of rows) {
      await maybeAutoConfirmStaleDelivery(row);
    }
  } catch (e) {
    console.error("autoConfirmStaleDeliveriesBatch", e);
  }
}

async function getMaterialOrderById(orderId) {
  let row = await prisma.materialOrder.findUnique({
    where: { id: orderId },
    include: {
      supplier: { select: { id: true, name: true, businessName: true, phone: true, address: true } },
    },
  });
  if (!row || !row.payload || typeof row.payload !== "object") return null;
  const pb = payloadBackedSupplierId(row.payload);
  if (!String(row.supplierId || "").trim() && pb) {
    row = await prisma.materialOrder.update({
      where: { id: row.id },
      data: { supplierId: pb },
      include: {
        supplier: { select: { id: true, name: true, businessName: true, phone: true, address: true } },
      },
    });
  }
  row = await maybeAutoConfirmStaleDelivery(row);
  const base = enrichOrderFromDbRow(row, row.payload);
  if (row.supplier) {
    base.supplierDisplayName = row.supplier.businessName || row.supplier.name || base.storeName;
    base.supplierPhone = row.supplier.phone || undefined;
    base.supplierAddress = row.supplier.address || undefined;
  }
  const track = await prisma.trackingSession.findFirst({
    where: { orderId: String(orderId), isActive: true },
    select: { trackingId: true, accessToken: true },
  });
  if (track?.trackingId) {
    base.activeTrackingId = track.trackingId;
    if (track.accessToken) {
      base.activeTrackingToken = track.accessToken;
    }
  }
  return base;
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
      return enrichOrderFromDbRow(row, next);
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
      return enrichOrderFromDbRow(row, updated);
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

const FULFILLMENT_ORDER = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "FAILED",
  "DELAYED",
  "CANCELLED",
];

function canFulfillmentTransition(from, to) {
  const f = String(from || "PENDING").toUpperCase();
  const t = String(to || "").toUpperCase();
  if (f === t) return true;
  const linear = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"];
  const i = linear.indexOf(f);
  const j = linear.indexOf(t);
  if (i >= 0 && j >= 0 && j === i + 1) return true;
  if (f === "OUT_FOR_DELIVERY" && ["FAILED", "DELAYED", "CANCELLED"].includes(t)) return true;
  return false;
}

async function updateMaterialOrderFulfillment(orderId, supplierId, nextStatus) {
  const next = String(nextStatus || "").toUpperCase();
  if (!FULFILLMENT_ORDER.includes(next)) {
    throw new AppError("Invalid fulfillment status", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      let row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row) throw new AppError("Material order not found", 404);
      const expectedSup = String(supplierId || "").trim();
      if (!materialOrderBelongsToSupplierStore(row, expectedSup)) {
        throw new AppError("Forbidden", 403);
      }
      if (String(row.supplierId || "").trim() !== expectedSup) {
        await tx.materialOrder.update({
          where: { id: orderId },
          data: { supplierId: expectedSup },
        });
        row = { ...row, supplierId: expectedSup };
      }
      const payloadPreview = row.payload && typeof row.payload === "object" ? row.payload : {};
      if (String(payloadPreview.deliveryType || "").toUpperCase() === "DELIVERY_PROVIDER") {
        if (["OUT_FOR_DELIVERY", "COMPLETED", "FAILED", "DELAYED", "CANCELLED"].includes(next)) {
          throw new AppError("Courier manages delivery for this order", 403);
        }
      }
      const currentStatus = row.fulfillmentStatus || "PENDING";
      if (!canFulfillmentTransition(currentStatus, next)) {
        throw new AppError(`Cannot transition from ${currentStatus} to ${next}`, 400);
      }
      let payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
      payload.fulfillmentStatus = next;
      const ts = new Date().toISOString();
      const activity = Array.isArray(payload.supplierActivity) ? [...payload.supplierActivity] : [];
      activity.push({
        type: "status",
        status: next,
        createdAt: ts,
      });
      payload.supplierActivity = activity;

      const tsPatch = {};
      if (next === "ACCEPTED") tsPatch.acceptedAt = ts;
      if (next === "READY") tsPatch.readyAt = ts;
      if (next === "OUT_FOR_DELIVERY") tsPatch.pickedUpAt = ts;
      if (next === "COMPLETED") tsPatch.deliveredAt = ts;
      payload.materialBatch = mergeMaterialBatch(payload, { ...row, fulfillmentStatus: next }, {
        status: fulfillmentEnumToBatchStatus(next),
        timestamps: tsPatch,
      });
      payload = patchPayloadForFulfillmentDelivery(payload, next);

      await tx.materialOrder.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: next,
          payload,
        },
      });
      const nextRow = { ...row, fulfillmentStatus: next, payload };
      return enrichOrderFromDbRow(nextRow, payload);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  ).then(async (enriched) => {
    try {
      const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
      if (row && ["READY", "OUT_FOR_DELIVERY", "COMPLETED", "FAILED", "DELAYED", "CANCELLED"].includes(next)) {
        const p = enriched && typeof enriched === "object" ? enriched : {};
        await notifyCustomerFulfillmentStep(row, next);
        emitMaterialOrderFulfillmentToCustomer(row.userId, {
          orderId: String(orderId),
          jobId: row.jobId || null,
          fulfillmentStatus: next,
          materialBatch: p.materialBatch,
        });
      }
      if (next === "OUT_FOR_DELIVERY") {
        const pay = enriched && typeof enriched === "object" ? enriched : {};
        if (String(pay.deliveryType || "").toUpperCase() === "STORE_DELIVERY") {
          const singleUse = process.env.TRACKING_ACCESS_TOKEN_SINGLE_USE === "true";
          const { trackingId, accessToken } = await trackingService.createActiveTrackingSession(orderId, {
            trackingSource: "supplier",
            accessTokenSingleUse: singleUse,
          });
          enriched.activeTrackingId = trackingId;
          if (accessToken) {
            enriched.activeTrackingToken = accessToken;
          }
        }
      }
    } catch (e) {
      console.error("postFulfillmentNotify", e);
    }
    try {
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(next)) {
        await trackingService.deactivateSessionsForOrder(orderId, next);
      }
    } catch (e) {
      console.error("postFulfillmentTrackingCleanup", e);
    }
    return enriched;
  });
}

async function updateMaterialOrderFulfillmentByProvider(orderId, providerUserId, nextStatus) {
  const next = String(nextStatus || "").toUpperCase();
  if (!["OUT_FOR_DELIVERY", "COMPLETED", "FAILED", "DELAYED"].includes(next)) {
    throw new AppError("Invalid fulfillment status for provider", 400);
  }
  const pid = String(providerUserId || "");

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({
        where: { id: orderId },
        include: { job: { select: { providerId: true } } },
      });
      if (!row) throw new AppError("Material order not found", 404);
      const payloadPreview = row.payload && typeof row.payload === "object" ? row.payload : {};
      if (String(payloadPreview.deliveryType || "").toUpperCase() !== "DELIVERY_PROVIDER") {
        throw new AppError("Not a courier delivery order", 400);
      }
      if (!row.jobId || !row.job || String(row.job.providerId || "") !== pid) {
        throw new AppError("Forbidden", 403);
      }
      const currentStatus = row.fulfillmentStatus || "PENDING";
      if (next === "OUT_FOR_DELIVERY" && currentStatus !== "READY") {
        throw new AppError("Materials must be ready before pickup", 400);
      }
      if (next === "COMPLETED" && currentStatus !== "OUT_FOR_DELIVERY") {
        throw new AppError("Cannot mark delivered before out for delivery", 400);
      }
      if (["FAILED", "DELAYED"].includes(next) && currentStatus !== "OUT_FOR_DELIVERY") {
        throw new AppError("Can only mark failed or delayed while out for delivery", 400);
      }
      let payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
      payload.fulfillmentStatus = next;
      const ts = new Date().toISOString();
      const activity = Array.isArray(payload.supplierActivity) ? [...payload.supplierActivity] : [];
      activity.push({
        type: "status",
        status: next,
        actor: "provider",
        createdAt: ts,
      });
      payload.supplierActivity = activity;

      const tsPatch = {};
      if (next === "OUT_FOR_DELIVERY") tsPatch.pickedUpAt = ts;
      if (next === "COMPLETED") tsPatch.deliveredAt = ts;
      if (next === "FAILED") tsPatch.failedAt = ts;
      if (next === "DELAYED") tsPatch.delayedAt = ts;
      payload.materialBatch = mergeMaterialBatch(payload, { ...row, fulfillmentStatus: next }, {
        status: fulfillmentEnumToBatchStatus(next),
        timestamps: tsPatch,
      });
      payload = patchPayloadForFulfillmentDelivery(payload, next);

      await tx.materialOrder.update({
        where: { id: orderId },
        data: {
          fulfillmentStatus: next,
          payload,
        },
      });
      const nextRow = { ...row, fulfillmentStatus: next, payload };
      return enrichOrderFromDbRow(nextRow, payload);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  ).then(async (enriched) => {
    try {
      const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
      if (next === "OUT_FOR_DELIVERY") {
        await trackingService.ensureProviderTrackingLead(orderId);
      }
      if (row && ["OUT_FOR_DELIVERY", "COMPLETED", "FAILED", "DELAYED"].includes(next)) {
        const p = enriched && typeof enriched === "object" ? enriched : {};
        await notifyCustomerFulfillmentStep(row, next);
        emitMaterialOrderFulfillmentToCustomer(row.userId, {
          orderId: String(orderId),
          jobId: row.jobId || null,
          fulfillmentStatus: next,
          materialBatch: p.materialBatch,
        });
      }
    } catch (e) {
      console.error("postProviderFulfillmentNotify", e);
    }
    try {
      if (["COMPLETED", "FAILED"].includes(next)) {
        await trackingService.deactivateSessionsForOrder(orderId, next);
      }
    } catch (e) {
      console.error("postProviderTrackingCleanup", e);
    }
    return enriched;
  });
}

async function confirmDeliveryReceipt(orderId, customerUserId) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      if (String(row.userId) !== String(customerUserId || "")) {
        throw new AppError("Forbidden", 403);
      }
      if (String(row.fulfillmentStatus || "") !== "COMPLETED") {
        throw new AppError("Delivery is not complete yet", 400);
      }
      const payload = { ...row.payload, deliveryConfirmed: true };
      await tx.materialOrder.update({
        where: { id: orderId },
        data: { payload },
      });
      return enrichOrderFromDbRow({ ...row, payload }, payload);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );
}

const ALLOWED_STATUS = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "FAILED",
  "DELAYED",
  "CANCELLED",
];

async function listMaterialOrdersBySupplier(supplierId, { fulfillmentStatus } = {}) {
  const raw =
    fulfillmentStatus !== undefined && fulfillmentStatus !== null && String(fulfillmentStatus).trim() !== ""
      ? String(fulfillmentStatus).toUpperCase()
      : null;
  const statusFilter =
    raw && ALLOWED_STATUS.includes(raw) ? { fulfillmentStatus: raw } : {};
  const sid = String(supplierId || "").trim();
  /** Indexed path — supplierId column set correctly */
  const byCol = await prisma.materialOrder.findMany({
    where: { supplierId: sid, ...statusFilter },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true, businessName: true } },
    },
  });
  /**
   * Legacy rows: supplierId null but payload still carries store id (Prisma JSON filters are brittle across drivers).
   * Scan recent null-supplier orders and match in JS (payload store id vs Supplier.id).
   */
  const since = new Date();
  since.setDate(since.getDate() - 365);
  const nullSupplierCandidates = await prisma.materialOrder.findMany({
    where: {
      supplierId: null,
      ...statusFilter,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 800,
    include: {
      supplier: { select: { id: true, name: true, businessName: true } },
    },
  });
  const nullMatches = nullSupplierCandidates.filter((r) => materialOrderBelongsToSupplierStore(r, sid));

  /** Column set to a different Supplier.id than payload store (data drift). */
  const wrongColWhere = {
    AND: [
      { supplierId: { not: null } },
      { NOT: { supplierId: sid } },
      { createdAt: { gte: since } },
      ...(Object.keys(statusFilter).length ? [statusFilter] : []),
    ],
  };
  const wrongColCandidates = await prisma.materialOrder.findMany({
    where: wrongColWhere,
    orderBy: { createdAt: "desc" },
    take: 600,
    include: {
      supplier: { select: { id: true, name: true, businessName: true } },
    },
  });
  const wrongColMatches = wrongColCandidates.filter((r) => materialOrderBelongsToSupplierStore(r, sid));

  const toRepair = [...nullMatches, ...wrongColMatches];
  if (toRepair.length > 0) {
    try {
      await Promise.all(
        toRepair.map((r) =>
          prisma.materialOrder.update({
            where: { id: r.id },
            data: { supplierId: sid },
          })
        )
      );
      for (const r of toRepair) {
        r.supplierId = sid;
      }
    } catch (e) {
      console.error("listMaterialOrdersBySupplier backfill supplierId", e);
    }
  }
  const map = new Map();
  for (const r of byCol) map.set(r.id, r);
  for (const r of toRepair) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  const rows = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const trackRows = await prisma.trackingSession.findMany({
    where: { orderId: { in: rows.map((r) => r.id) }, isActive: true },
    select: { orderId: true, trackingId: true, accessToken: true },
  });
  const trackMap = new Map(trackRows.map((t) => [t.orderId, t]));
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const base = enrichOrderFromDbRow(
      r,
      r.payload && typeof r.payload === "object" ? r.payload : {}
    );
    const u = uMap.get(r.userId);
    const t = trackMap.get(r.id);
    return {
      ...base,
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      paymentStatus: r.paymentStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
      activeTrackingId: t?.trackingId || undefined,
      activeTrackingToken: t?.accessToken || undefined,
    };
  });
}

async function listMaterialOrdersBySupplierIdsForAdmin(supplierIds) {
  const ids = Array.isArray(supplierIds)
    ? supplierIds.map(String)
    : supplierIds != null && supplierIds !== ""
      ? [String(supplierIds)]
      : [];

  const where = ids.length === 0 ? {} : { supplierId: { in: ids } };

  const rows = await prisma.materialOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
    },
  });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((r) => {
    const base = enrichOrderFromDbRow(
      r,
      r.payload && typeof r.payload === "object" ? r.payload : {}
    );
    const u = uMap.get(r.userId);
    return {
      ...base,
      jobId: r.jobId,
      providerId: r.providerId,
      source: r.source,
      paymentStatus: r.paymentStatus,
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      supplierSnapshot: r.supplier
        ? {
            id: r.supplier.id,
            name: r.supplier.name,
            businessName: r.supplier.businessName,
          }
        : null,
    };
  });
}

async function appendSupplierOrderNote(orderId, userId, message) {
  const raw = String(message ?? "").trim();
  if (!raw) {
    throw new AppError("Message is required", 400);
  }
  if (raw.length > 2000) {
    throw new AppError("Message is too long", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      const supplier = await supplierService.requireSupplierOwnedByUserId(userId);
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row) {
        throw new AppError("Material order not found", 404);
      }
      if (!materialOrderBelongsToSupplierStore(row, supplier.id)) {
        throw new AppError("Forbidden", 403);
      }
      if (String(row.supplierId || "").trim() !== String(supplier.id || "")) {
        await tx.materialOrder.update({
          where: { id: orderId },
          data: { supplierId: String(supplier.id) },
        });
      }

      const base = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
      const ts = new Date().toISOString();
      const activity = Array.isArray(base.supplierActivity) ? [...base.supplierActivity] : [];
      activity.push({
        type: "note",
        message: raw,
        createdAt: ts,
      });
      base.supplierActivity = activity;

      await tx.materialOrder.update({
        where: { id: orderId },
        data: {
          payload: base,
        },
      });

      return enrichOrderFromDbRow(
        { ...row, payload: base },
        base
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
}

async function emitSupplierMaterialOrderCreated(supplierIdStr, orderId) {
  try {
    if (!global.io || !supplierIdStr) return;
    const row = await prisma.supplier.findUnique({
      where: { id: String(supplierIdStr) },
      select: { userId: true },
    });
    if (row?.userId) {
      global.io.to(String(row.userId)).emit("supplier:material_order:new", {
        orderId,
        supplierId: String(supplierIdStr),
      });
    }
  } catch (e) {
    console.error("emitSupplierMaterialOrderCreated", e);
  }
}

/**
 * After customer pays job materials for a store: persist MaterialOrder for supplier dashboard & fulfillment.
 * Idempotent on (jobId, supplierId, customer userId, source=job_materials).
 */
async function ensureJobMaterialPurchaseOrder(params) {
  const {
    jobId,
    customerUserId,
    providerUserId,
    supplierId,
    materialsLines,
    invoiceId,
    jobStoreOrderId,
    jobDeliveryType = "SELF",
    deliveryProviderId: paramDeliveryProviderId,
    jobSiteAddress = "",
  } = params;
  const sid = String(supplierId || "").trim();
  if (!jobId || !sid || !customerUserId) {
    throw new AppError("jobId, supplierId and customerUserId are required", 400);
  }

  const storeOrderId = jobStoreOrderId ? String(jobStoreOrderId).trim() : "";

  if (storeOrderId) {
    let byId = await prisma.materialOrder.findUnique({ where: { id: storeOrderId } });
    if (byId) {
      if (!String(byId.supplierId || "").trim() && sid) {
        byId = await prisma.materialOrder.update({
          where: { id: byId.id },
          data: { supplierId: sid },
        });
      }
      return enrichOrderFromDbRow(
        byId,
        byId.payload && typeof byId.payload === "object" ? byId.payload : {}
      );
    }
  }

  if (!storeOrderId) {
    const candidates = await prisma.materialOrder.findMany({
      where: {
        jobId: String(jobId),
        userId: String(customerUserId),
        source: "job_materials",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const existing = candidates.find((c) => materialOrderBelongsToSupplierStore(c, sid));
    if (existing) {
      let ex = existing;
      if (!String(ex.supplierId || "").trim() && sid) {
        ex = await prisma.materialOrder.update({
          where: { id: ex.id },
          data: { supplierId: sid },
        });
      }
      return enrichOrderFromDbRow(
        ex,
        ex.payload && typeof ex.payload === "object" ? ex.payload : {}
      );
    }
  }

  const lines = Array.isArray(materialsLines) ? materialsLines : [];
  const materialsTotal = lines.reduce((sum, m) => sum + coerceAmt(m.qty) * coerceAmt(m.unitPrice), 0);
  const items = lines.map((m) => ({
    supplierId: String(m.supplierId),
    productId: String(m.productId || ""),
    name: String(m.name || ""),
    qty: coerceAmt(m.qty, 0),
    unitPrice: coerceAmt(m.unitPrice, 0),
    quantity: coerceAmt(m.qty, 0),
    price: coerceAmt(m.unitPrice, 0),
    qualityTier: m.qualityTier,
    imageUrl: m.imageUrl,
    supplierName: m.supplierName,
  }));

  const jd = String(jobDeliveryType || "SELF").toUpperCase();
  const apiDel = jd === "STORE" ? "STORE" : jd === "PROVIDER" || jd === "DELIVERY_PROVIDER" ? "PROVIDER" : "SELF";

  const { prismaRow, order } = normalizeOrder({
    id: storeOrderId || undefined,
    userId: String(customerUserId),
    storeId: sid,
    storeName: lines[0]?.supplierName || "Store",
    items,
    materialsTotal,
    delivery: { type: apiDel, fee: 0, providerId: paramDeliveryProviderId },
    jobId: String(jobId),
    providerId: providerUserId ? String(providerUserId) : null,
    paymentStatus: "paid",
    source: "job_materials",
  });

  const supplierRow = await prisma.supplier.findUnique({
    where: { id: sid },
    select: { address: true },
  });
  const pickupAddr = supplierRow?.address ? String(supplierRow.address) : "";

  const finalPayload = {
    ...order,
    invoiceId: invoiceId || order.invoiceId,
    jobStoreOrderId: storeOrderId || order.id,
  };
  finalPayload.materialBatch = mergeMaterialBatch(finalPayload, { id: prismaRow.id, supplierId: sid, fulfillmentStatus: "PENDING" }, {
    status: "pending",
  });
  finalPayload.materialBatch.pickupAddress = pickupAddr;
  finalPayload.materialBatch.deliveryAddress = String(jobSiteAddress || "");
  finalPayload.materialBatch.deliveryType = deliveryJobTypeToCanonical(apiDel);
  if (paramDeliveryProviderId) {
    finalPayload.materialBatch.assignedDriverId = String(paramDeliveryProviderId);
  }

  await prisma.materialOrder.create({
    data: {
      id: prismaRow.id,
      userId: prismaRow.userId,
      supplierId: prismaRow.supplierId,
      jobId: prismaRow.jobId,
      providerId: prismaRow.providerId,
      paymentStatus: prismaRow.paymentStatus,
      source: prismaRow.source,
      fulfillmentStatus: prismaRow.fulfillmentStatus,
      materialsSubtotal: prismaRow.materialsSubtotal,
      platformCommission: prismaRow.platformCommission,
      supplierEarning: prismaRow.supplierEarning,
      payload: finalPayload,
    },
  });

  await emitSupplierMaterialOrderCreated(sid, prismaRow.id);
  return finalPayload;
}

async function getJobMaterialOrdersForJob(jobId) {
  const rows = await prisma.materialOrder.findMany({
    where: { jobId: String(jobId) },
    orderBy: { createdAt: "desc" },
    include: { supplier: { select: { id: true, name: true, businessName: true } } },
  });
  return rows.map((r) => {
    const payload = r.payload && typeof r.payload === "object" ? r.payload : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      id: r.id,
      jobId: r.jobId,
      supplierId: r.supplierId,
      supplierName: r.supplier?.name || payload.storeName || "Store",
      customerId: r.userId,
      providerId: r.providerId,
      fulfillmentStatus: r.fulfillmentStatus,
      paymentStatus: r.paymentStatus,
      source: r.source,
      jobStoreOrderId: payload.jobStoreOrderId || null,
      total: Number(payload.total ?? r.materialsSubtotal ?? 0),
      materialsSubtotal: Number(r.materialsSubtotal ?? 0),
      platformCommission: Number(r.platformCommission ?? 0),
      supplierEarning: Number(r.supplierEarning ?? 0),
      items: items.map((i) => ({
        name: i.name,
        quantity: Number(i.quantity ?? i.qty ?? 0),
        price: Number(i.price ?? i.unitPrice ?? 0),
        productId: i.productId,
      })),
      materialBatch: mergeMaterialBatch(payload, r, {}),
      createdAt: r.createdAt?.toISOString?.() || String(r.createdAt),
    };
  });
}

const ADMIN_ANALYTICS_COMMISSION_RATE = 0.07;

function roundMoney2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Order total for analytics: payload.total if present, else materials + delivery fee from payload/row. */
function orderTotalFromRow(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const fromPayload = Number(payload.total);
  if (Number.isFinite(fromPayload) && fromPayload >= 0) return fromPayload;
  const mat = Number(row.materialsSubtotal ?? payload.materialsSubtotal ?? 0);
  const fee = Number(payload.deliveryFee ?? 0);
  return Math.max(0, mat + fee);
}

/**
 * Aggregates completed + paid material orders (platform-wide or per supplier).
 * Commission = 7% of each order's total (see orderTotalFromRow).
 */
async function aggregateCompletedPaidMaterialOrders({ supplierId } = {}) {
  const where = {
    paymentStatus: "paid",
    fulfillmentStatus: "COMPLETED",
    ...(supplierId != null && String(supplierId).trim() !== ""
      ? { supplierId: String(supplierId) }
      : { supplierId: { not: null } }),
  };
  const rows = await prisma.materialOrder.findMany({
    where,
    select: { materialsSubtotal: true, payload: true },
  });
  let totalRevenue = 0;
  for (const row of rows) {
    totalRevenue += orderTotalFromRow(row);
  }
  totalRevenue = roundMoney2(totalRevenue);
  const orderCount = rows.length;
  const totalCommission = roundMoney2(totalRevenue * ADMIN_ANALYTICS_COMMISSION_RATE);
  const averageOrderValue = orderCount > 0 ? roundMoney2(totalRevenue / orderCount) : 0;
  return {
    orderCount,
    totalRevenue,
    totalCommission,
    averageOrderValue,
    commissionRate: ADMIN_ANALYTICS_COMMISSION_RATE,
  };
}

/** Recent material orders for admin supplier view (newest first). */
async function listRecentMaterialOrdersBySupplierForAdmin(supplierId, { limit = 10 } = {}) {
  const sid = String(supplierId || "").trim();
  if (!sid) {
    throw new AppError("supplierId is required", 400);
  }
  const take = Math.min(50, Math.max(1, Number(limit) || 10));
  const rows = await prisma.materialOrder.findMany({
    where: { supplierId: sid },
    orderBy: { createdAt: "desc" },
    take,
    include: { supplier: true },
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const base = enrichOrderFromDbRow(r, r.payload && typeof r.payload === "object" ? r.payload : {});
    const u = uMap.get(r.userId);
    return {
      ...base,
      id: r.id,
      jobId: r.jobId,
      providerId: r.providerId,
      source: r.source,
      paymentStatus: r.paymentStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      total: orderTotalFromRow(r),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
    };
  });
}

async function listAllMaterialOrdersForAdmin({ limit = 200 } = {}) {
  const rows = await prisma.materialOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { supplier: true },
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const base = enrichOrderFromDbRow(r, r.payload && typeof r.payload === "object" ? r.payload : {});
    const u = uMap.get(r.userId);
    return {
      ...base,
      id: r.id,
      jobId: r.jobId,
      providerId: r.providerId,
      source: r.source,
      paymentStatus: r.paymentStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      materialsSubtotal: Number(r.materialsSubtotal || 0),
      platformCommission: Number(r.platformCommission || 0),
      supplierEarning: Number(r.supplierEarning || 0),
      supplierSnapshot: r.supplier
        ? { id: r.supplier.id, name: r.supplier.name, businessName: r.supplier.businessName }
        : null,
      createdAt: r.createdAt,
    };
  });
}

module.exports = {
  aggregateCompletedPaidMaterialOrders,
  listRecentMaterialOrdersBySupplierForAdmin,
  orderTotalFromRow,
  createMaterialOrder,
  getMaterialOrders,
  getMaterialOrderById,
  updateMaterialOrderDelivery,
  approveMaterialOrderDelivery,
  rejectMaterialOrderDelivery,
  payMaterialOrderDelivery,
  updateMaterialOrderDeliveryStatus,
  updateMaterialOrderFulfillment,
  updateMaterialOrderFulfillmentByProvider,
  confirmDeliveryReceipt,
  autoConfirmStaleDeliveriesBatch,
  appendSupplierOrderNote,
  listMaterialOrdersBySupplier,
  listMaterialOrdersBySupplierIdsForAdmin,
  listAllMaterialOrdersForAdmin,
  normalizeOrder,
  ensureJobMaterialPurchaseOrder,
  getJobMaterialOrdersForJob,
  emitSupplierMaterialOrderCreated,
};
