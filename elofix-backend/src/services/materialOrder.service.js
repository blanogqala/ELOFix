const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const supplierService = require("./supplier.service");
const notificationService = require("./notification.service");

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
    }
  } catch (e) {
    console.error("notifyCustomerFulfillmentStep", e);
  }
}

function normalizeDeliveryStatus(status) {
  const allowed = ["SelfCollect", "PendingApproval", "Approved", "Rejected", "Cancelled", "InProgress", "Delivered"];
  return allowed.includes(status) ? status : "Processing";
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

async function getMaterialOrderById(orderId) {
  const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!row || !row.payload || typeof row.payload !== "object") return null;
  return enrichOrderFromDbRow(row, row.payload);
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

const FULFILLMENT_ORDER = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"];

function canTransition(from, to) {
  const i = FULFILLMENT_ORDER.indexOf(from);
  const j = FULFILLMENT_ORDER.indexOf(to);
  if (i < 0 || j < 0) return false;
  return j === i + 1 || (from === to && j === i);
}

async function updateMaterialOrderFulfillment(orderId, supplierId, nextStatus) {
  const next = String(nextStatus || "").toUpperCase();
  if (!FULFILLMENT_ORDER.includes(next)) {
    throw new AppError("Invalid fulfillment status", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row) throw new AppError("Material order not found", 404);
      if (String(row.supplierId || "") !== String(supplierId || "")) {
        throw new AppError("Forbidden", 403);
      }
      const currentStatus = row.fulfillmentStatus || "PENDING";
      if (!canTransition(currentStatus, next)) {
        throw new AppError(`Cannot transition from ${currentStatus} to ${next}`, 400);
      }
      const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
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
      if (row && ["READY", "OUT_FOR_DELIVERY", "COMPLETED"].includes(next)) {
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
      console.error("postFulfillmentNotify", e);
    }
    return enriched;
  });
}

const ALLOWED_STATUS = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"];

async function listMaterialOrdersBySupplier(supplierId, { fulfillmentStatus } = {}) {
  const raw =
    fulfillmentStatus !== undefined && fulfillmentStatus !== null && String(fulfillmentStatus).trim() !== ""
      ? String(fulfillmentStatus).toUpperCase()
      : null;
  const statusFilter =
    raw && ALLOWED_STATUS.includes(raw) ? { fulfillmentStatus: raw } : {};
  const where = {
    supplierId: String(supplierId || ""),
    ...statusFilter,
  };
  const rows = await prisma.materialOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true, businessName: true } },
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
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      paymentStatus: r.paymentStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
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
      if (String(row.supplierId || "") !== String(supplier.id || "")) {
        throw new AppError("Forbidden", 403);
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
    const byId = await prisma.materialOrder.findUnique({ where: { id: storeOrderId } });
    if (byId) {
      return enrichOrderFromDbRow(
        byId,
        byId.payload && typeof byId.payload === "object" ? byId.payload : {}
      );
    }
  }

  if (!storeOrderId) {
    const existing = await prisma.materialOrder.findFirst({
      where: {
        jobId: String(jobId),
        supplierId: sid,
        userId: String(customerUserId),
        source: "job_materials",
      },
    });
    if (existing) {
      return enrichOrderFromDbRow(
        existing,
        existing.payload && typeof existing.payload === "object" ? existing.payload : {}
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
  appendSupplierOrderNote,
  listMaterialOrdersBySupplier,
  listMaterialOrdersBySupplierIdsForAdmin,
  listAllMaterialOrdersForAdmin,
  normalizeOrder,
  ensureJobMaterialPurchaseOrder,
  getJobMaterialOrdersForJob,
  emitSupplierMaterialOrderCreated,
};
