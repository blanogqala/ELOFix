const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const supplierService = require("./supplier.service");
const notificationService = require("./notification.service");
const trackingService = require("./tracking.service");
const { logAudit } = require("./auditLog.service");
const paymentService = require("./payment.service");
const branchService = require("./branch.service");
const branchStaffNotificationService = require("./branchStaffNotification.service");

async function assertOrderOwnedBySupplierOrgTx(tx, row, supplierOrgId) {
  const org = String(supplierOrgId || "").trim();
  if (!row || !org) throw new AppError("Forbidden", 403);
  if (String(row.supplierId || "").trim() === org) return;
  const bid = String(row.branchId || "").trim();
  if (!bid) throw new AppError("Forbidden", 403);
  const b = await tx.branch.findUnique({ where: { id: bid }, select: { supplierId: true } });
  if (!b || String(b.supplierId) !== org) throw new AppError("Forbidden", 403);
}

async function assertOrderOwnedBySupplierOrg(row, supplierOrgId) {
  return assertOrderOwnedBySupplierOrgTx(prisma, row, supplierOrgId);
}

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

function stripClientTrackingFromOrderInput(raw = {}) {
  const input = raw && typeof raw === "object" ? { ...raw } : {};
  delete input.activeTrackingId;
  delete input.activeTrackingToken;
  delete input.driverLocation;
  if (input.materialBatch && typeof input.materialBatch === "object") {
    const mb = { ...input.materialBatch };
    delete mb.activeTrackingId;
    delete mb.activeTrackingToken;
    delete mb.driverLocation;
    input.materialBatch = mb;
  }
  return input;
}

function mergeMaterialBatch(payload, row, overrides = {}) {
  const base = payload.materialBatch && typeof payload.materialBatch === "object" ? { ...payload.materialBatch } : {};
  const id = base.id || row.id;
  const branchId = String(
    base.branchId || row.branchId || payload.branchId || payload.storeId || ""
  ).trim();
  const supplierOrgId = String(row.supplierId || "").trim();
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
  const batchSupplierOrg = supplierOrgId || String(base.supplierId || "").trim();
  return {
    ...base,
    id,
    branchId,
    supplierId: batchSupplierOrg,
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
  if (row.branchId) p.branchId = row.branchId;
  if (row.jobId) p.jobId = row.jobId;
  if (row.providerId) p.providerId = row.providerId;
  if (row.source) p.source = row.source;
  if (row.paymentStatus) p.dbPaymentStatus = row.paymentStatus;
  if (row.fulfillmentStatus) p.fulfillmentStatus = row.fulfillmentStatus;
  if (row.materialsSubtotal != null) p.materialsSubtotal = Number(row.materialsSubtotal);
  if (row.platformCommission != null) p.platformCommission = Number(row.platformCommission);
  if (row.supplierEarning != null) p.supplierEarning = Number(row.supplierEarning);
  if (row.cancelledBy != null) p.cancelledBy = String(row.cancelledBy);
  if (row.cancellationReason != null) p.cancellationReason = String(row.cancellationReason);
  if (row.cancelledAt != null) p.cancelledAt = row.cancelledAt instanceof Date ? row.cancelledAt.toISOString() : String(row.cancelledAt);
  if (row.refundStatus != null) p.refundStatus = String(row.refundStatus);
  if (row.refundAmount != null) p.refundAmount = Number(row.refundAmount);
  if (row.refundProcessedAt != null) p.refundProcessedAt = row.refundProcessedAt instanceof Date ? row.refundProcessedAt.toISOString() : String(row.refundProcessedAt);
  if (row.refundReference != null) p.refundReference = String(row.refundReference);
  if (row.commissionReversed != null) p.commissionReversed = Number(row.commissionReversed);
  return p;
}

function coerceAmt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function normalizeDeliveryStatus(status) {
  const s = String(status || "Processing").trim();
  const allowed = new Set([
    "SelfCollect",
    "PendingApproval",
    "Approved",
    "Rejected",
    "Cancelled",
    "InProgress",
    "Processing",
    "OnTheWay",
    "Delivered",
  ]);
  return allowed.has(s) ? s : "Processing";
}

function normalizeOrder(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const delivery = input.delivery || {};
  const materialsTotal = Number(input.materialsTotal || 0);
  const deliveryFee = Number(delivery.fee || 0);
  const customerLocation =
    input.customerLocation && typeof input.customerLocation === "object" && !Array.isArray(input.customerLocation)
      ? {
          address: String(input.customerLocation.address || "").trim() || undefined,
          city: String(input.customerLocation.city || "").trim() || undefined,
          area: String(input.customerLocation.area || "").trim() || undefined,
          suburb: String(input.customerLocation.suburb || "").trim() || undefined,
          coordinates:
            input.customerLocation.coordinates &&
            typeof input.customerLocation.coordinates === "object" &&
            Number.isFinite(Number(input.customerLocation.coordinates.lat)) &&
            Number.isFinite(Number(input.customerLocation.coordinates.lng))
              ? {
                  lat: Number(input.customerLocation.coordinates.lat),
                  lng: Number(input.customerLocation.coordinates.lng),
                }
              : undefined,
        }
      : {
          address: String(delivery.address || input.deliveryAddress || "").trim() || undefined,
          city: String(delivery.city || "").trim() || undefined,
          area: String(delivery.area || "").trim() || undefined,
          suburb: String(delivery.suburb || "").trim() || undefined,
          coordinates:
            delivery.coordinates &&
            typeof delivery.coordinates === "object" &&
            Number.isFinite(Number(delivery.coordinates.lat)) &&
            Number.isFinite(Number(delivery.coordinates.lng))
              ? { lat: Number(delivery.coordinates.lat), lng: Number(delivery.coordinates.lng) }
              : undefined,
        };

  const { materialsSubtotal, platformCommission, supplierEarning } = supplierService.splitMaterialsCommission(materialsTotal);
  const branchId = String(input.branchId || input.storeId || "").trim();
  const id = typeof input.id === "string" ? input.id : randomUUID();

  const orderCore = {
    id,
    userId: String(input.userId || ""),
    storeId: branchId,
    branchId,
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
    customerLocation,
    supplierActivity: [{ type: "created", createdAt: new Date().toISOString() }],
    materialBatch: {
      id,
      branchId,
      supplierId: "",
      items,
      status: "pending",
      deliveryType: deliveryJobTypeToCanonical(delivery.type || "SELF"),
      pickupAddress: "",
      deliveryAddress: String(customerLocation.address || ""),
      assignedDriverId: delivery.providerId || undefined,
      timestamps: {},
    },
  };

  const prismaRow = {
    id: orderCore.id,
    userId: orderCore.userId,
    branchId,
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
  const clean = stripClientTrackingFromOrderInput(params || {});
  const { prismaRow, order } = normalizeOrder(clean);
  if (prismaRow.source === "store_checkout" && !String(order.customerLocation?.address || "").trim()) {
    throw new AppError("Delivery address is required to order materials", 400);
  }

  const branchId = String(prismaRow.branchId || order.branchId || order.storeId || "").trim();
  if (!branchId) {
    throw new AppError("branchId or storeId is required", 400);
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { supplier: true },
  });
  if (!branch || !branch.isActive) {
    throw new AppError("Invalid store — branch not found", 400);
  }

  const orgId = branch.supplierId;
  prismaRow.supplierId = orgId;
  prismaRow.branchId = branchId;
  order.storeId = branchId;
  order.branchId = branchId;
  order.storeName = branchService.branchPublicDisplay(branch, branch.supplier);

  const nextPayload = {
    ...order,
    storeName: order.storeName,
    activeTrackingId: undefined,
    activeTrackingToken: undefined,
    driverLocation: undefined,
    materialBatch: mergeMaterialBatch(
      order,
      { id: prismaRow.id, branchId, supplierId: orgId, fulfillmentStatus: "PENDING" },
      {}
    ),
  };
  delete nextPayload.activeTrackingId;
  delete nextPayload.activeTrackingToken;
  delete nextPayload.driverLocation;

  await prisma.materialOrder.create({
    data: {
      id: prismaRow.id,
      userId: prismaRow.userId,
      supplierId: orgId,
      branchId,
      jobId: prismaRow.jobId,
      providerId: prismaRow.providerId,
      paymentStatus: prismaRow.paymentStatus,
      source: prismaRow.source,
      fulfillmentStatus: prismaRow.fulfillmentStatus,
      materialsSubtotal: prismaRow.materialsSubtotal,
      platformCommission: prismaRow.platformCommission,
      supplierEarning: prismaRow.supplierEarning,
      payload: nextPayload,
    },
  });
  try {
    await emitSupplierMaterialOrderCreated(orgId, prismaRow.id, branchId, prismaRow.jobId);
  } catch (_) {
    /* non-fatal socket */
  }
  return nextPayload;
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
      orderBy: { createdAt: "desc" },
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
      supplier: { select: { id: true, name: true, businessName: true, phone: true, address: true, brandName: true } },
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          area: true,
          branchPhone: true,
          branchEmail: true,
          hasDelivery: true,
          deliveryFee: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });
  if (!row || !row.payload || typeof row.payload !== "object") return null;
  row = await maybeAutoConfirmStaleDelivery(row);
  const base = enrichOrderFromDbRow(row, row.payload);
  if (row.branch && row.supplier) {
    base.supplierDisplayName = branchService.branchPublicDisplay(row.branch, row.supplier);
    const branchPhone =
      row.branch.branchPhone != null && String(row.branch.branchPhone).trim()
        ? String(row.branch.branchPhone).trim()
        : null;
    base.supplierPhone = branchPhone || row.supplier.phone || undefined;
    base.supplierAddress = row.branch.address || row.supplier.address || undefined;
    const branchEmail =
      row.branch.branchEmail != null && String(row.branch.branchEmail).trim()
        ? String(row.branch.branchEmail).trim()
        : null;
    if (branchEmail) base.branchContactEmail = branchEmail;
    const city = row.branch.city != null && String(row.branch.city).trim() ? String(row.branch.city).trim() : null;
    if (city) base.branchCity = city;
    const area = row.branch.area != null && String(row.branch.area).trim() ? String(row.branch.area).trim() : null;
    if (area) base.branchArea = area;
    base.branchHasDelivery = Boolean(row.branch.hasDelivery);
    const bdf = Number(row.branch.deliveryFee ?? 0);
    base.branchDeliveryFee = Number.isFinite(bdf) ? bdf : 0;
    const latNum =
      row.branch.latitude !== undefined && row.branch.latitude !== null && String(row.branch.latitude) !== ""
        ? Number(row.branch.latitude)
        : NaN;
    const lngNum =
      row.branch.longitude !== undefined && row.branch.longitude !== null && String(row.branch.longitude) !== ""
        ? Number(row.branch.longitude)
        : NaN;
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      base.branchCoordinates = { lat: latNum, lng: lngNum };
    }
  } else if (row.supplier) {
    base.supplierDisplayName = row.supplier.businessName || row.supplier.name || base.storeName;
    base.supplierPhone = row.supplier.phone || undefined;
    base.supplierAddress = row.supplier.address || undefined;
  }
  const customerLocation =
    row.payload && typeof row.payload.customerLocation === "object" && !Array.isArray(row.payload.customerLocation)
      ? row.payload.customerLocation
      : undefined;
  const fallbackDeliveryAddress =
    row.payload &&
    row.payload.materialBatch &&
    typeof row.payload.materialBatch === "object" &&
    row.payload.materialBatch.deliveryAddress
      ? String(row.payload.materialBatch.deliveryAddress)
      : undefined;
  base.customerLocation = customerLocation;
  base.customerAddress = customerLocation?.address || fallbackDeliveryAddress;
  const fs = String(row.fulfillmentStatus || "").toUpperCase();
  if (fs === "OUT_FOR_DELIVERY") {
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
  }

  return base;
}

function assertCustomerCanManageOrderDelivery(row, actorUserId, actorRole) {
  const role = String(actorRole || "").trim().toUpperCase();
  if (role === "ADMIN") return;
  if (role === "CUSTOMER" && String(row.userId || "") === String(actorUserId || "")) return;
  throw new AppError("Forbidden", 403);
}

async function updateMaterialOrderDelivery(orderId, updates = {}, actorUserId, actorRole) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      assertCustomerCanManageOrderDelivery(row, actorUserId, actorRole);
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

async function approveMaterialOrderDelivery(orderId, actorUserId, actorRole) {
  return updateMaterialOrderDelivery(orderId, { status: "Approved" }, actorUserId, actorRole);
}

async function rejectMaterialOrderDelivery(orderId, actorUserId, actorRole) {
  return updateMaterialOrderDelivery(orderId, { status: "Rejected" }, actorUserId, actorRole);
}

async function payMaterialOrderDelivery(orderId, cardLast4, fee, actorUserId, actorRole) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      assertCustomerCanManageOrderDelivery(row, actorUserId, actorRole);
      if (String(row.fulfillmentStatus || "").toUpperCase() === "COMPLETED") {
        throw new AppError("Cannot attach payment to completed order", 400);
      }
      console.log(
        JSON.stringify({
          ns: "material_order",
          event: "delivery_payment_attach",
          orderId: String(orderId),
          at: new Date().toISOString(),
        })
      );
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

async function updateMaterialOrderDeliveryStatus(orderId, status, actorUserId, actorRole) {
  let mapped = "Processing";
  if (status === "delivered") mapped = "Delivered";
  else if (status === "out_for_delivery") mapped = "InProgress";
  return updateMaterialOrderDelivery(orderId, { status: mapped }, actorUserId, actorRole);
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

/** Customer may cancel before dispatch: awaiting supplier through ready-for-collection. */
const CUSTOMER_CANCEL_ALLOWED = new Set(["PENDING", "ACCEPTED", "PREPARING", "READY"]);
const CANCEL_TERMINAL = new Set(["CANCELLED", "COMPLETED", "FAILED"]);

function safeMoney2(value) {
  return Math.max(0, roundMoney2(Number(value || 0)));
}

function buildCancelOutcome({ actor, row, payload }) {
  const total = safeMoney2(payload.total ?? row.materialsSubtotal ?? 0);
  const commission7 = safeMoney2(total * 0.07);
  if (actor === "supplier") {
    return {
      refundAmount: total,
      commissionReversed: commission7,
      keptCommission: 0,
      nextSupplierEarning: 0,
      refundKind: "full_supplier_cancel",
    };
  }
  const refundAmount = safeMoney2(total - commission7);
  return {
    refundAmount,
    commissionReversed: 0,
    keptCommission: commission7,
    nextSupplierEarning: safeMoney2(total - commission7),
    refundKind: "customer_cancel_keep_commission",
  };
}

function assertCanCancel({ actor, currentStatus }) {
  if (CANCEL_TERMINAL.has(currentStatus)) {
    throw new AppError(`Cannot cancel order in ${currentStatus} state`, 400);
  }
  if (actor === "customer" && !CUSTOMER_CANCEL_ALLOWED.has(currentStatus)) {
    throw new AppError(
      "Customer can cancel while awaiting supplier or until ready for collection (not after dispatch)",
      400
    );
  }
  if (currentStatus === "OUT_FOR_DELIVERY" && actor === "customer") {
    throw new AppError("Cannot cancel when order is out for delivery", 400);
  }
}

async function cancelMaterialOrderInTransaction(tx, { orderId, actor, actorUserId, reason, expectedSupplierId, branchScopeId }) {
  let row = await tx.materialOrder.findUnique({ where: { id: orderId } });
  if (!row) throw new AppError("Material order not found", 404);

  if (expectedSupplierId) {
    await assertOrderOwnedBySupplierOrgTx(tx, row, expectedSupplierId);
  }
  const expectedBranch = branchScopeId != null && String(branchScopeId).trim() !== "" ? String(branchScopeId).trim() : null;
  if (expectedBranch && String(row.branchId || "") !== expectedBranch) {
    throw new AppError("Forbidden", 403);
  }
  if (actor === "customer" && String(row.userId || "") !== String(actorUserId || "")) {
    throw new AppError("Forbidden", 403);
  }

  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  const currentStatus = String(row.fulfillmentStatus || "PENDING").toUpperCase();
  assertCanCancel({ actor, currentStatus });

  if (String(row.refundStatus || "").toLowerCase() === "processed") {
    return {
      order: enrichOrderFromDbRow(row, payload),
      refund: {
        amount: Number(row.refundAmount || 0),
        status: String(row.refundStatus || "processed"),
        processedAt: row.refundProcessedAt ? row.refundProcessedAt.toISOString() : undefined,
        reference: row.refundReference || undefined,
      },
      duplicate: true,
    };
  }

  const outcome = buildCancelOutcome({ actor, row, payload });
  const now = new Date();
  const nowIso = now.toISOString();
  const refundReference = `mat-${orderId}-cancel-${now.getTime()}`;
  const activity = Array.isArray(payload.supplierActivity) ? [...payload.supplierActivity] : [];
  activity.push({
    type: "cancellation",
    actor,
    reason: reason || null,
    createdAt: nowIso,
  });

  const nextPayload = patchPayloadForFulfillmentDelivery(
    {
      ...payload,
      supplierActivity: activity,
      cancellation: {
        by: actor,
        reason: reason || null,
        at: nowIso,
      },
    },
    "CANCELLED"
  );

  row = await tx.materialOrder.update({
    where: { id: orderId },
    data: {
      fulfillmentStatus: "CANCELLED",
      paymentStatus: outcome.refundAmount > 0 ? "refunded" : row.paymentStatus,
      cancelledBy: actor,
      cancellationReason: reason || null,
      cancelledAt: now,
      refundStatus: "processed",
      refundAmount: new Prisma.Decimal(outcome.refundAmount),
      refundProcessedAt: now,
      refundReference,
      commissionReversed: new Prisma.Decimal(outcome.commissionReversed),
      supplierEarning: new Prisma.Decimal(outcome.nextSupplierEarning),
      payload: nextPayload,
    },
  });

  if (outcome.refundAmount > 0) {
    await paymentService.createRefundInvoiceInTransaction(tx, {
      userId: row.userId,
      jobId: row.jobId || undefined,
      laborRefund: 0,
      materialsRefund: outcome.refundAmount,
      lineItems: [
        {
          description: actor === "supplier" ? "Supplier order cancellation refund" : "Customer order cancellation refund",
          quantity: 1,
          unitPrice: outcome.refundAmount,
          total: outcome.refundAmount,
        },
      ],
      meta: {
        materialOrderId: orderId,
        cancelledBy: actor,
        refundReference,
        reason: reason || null,
      },
    });
  }

  return {
    order: enrichOrderFromDbRow(row, nextPayload),
    refund: {
      amount: outcome.refundAmount,
      status: "processed",
      processedAt: nowIso,
      reference: refundReference,
      kind: outcome.refundKind,
      keptCommission: outcome.keptCommission,
      commissionReversed: outcome.commissionReversed,
    },
    duplicate: false,
  };
}

async function updateMaterialOrderFulfillment(orderId, supplierId, nextStatus, options = {}) {
  const next = String(nextStatus || "").toUpperCase();
  if (!FULFILLMENT_ORDER.includes(next)) {
    throw new AppError("Invalid fulfillment status", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      let row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row) throw new AppError("Material order not found", 404);
      const expectedSup = String(supplierId || "").trim();
      await assertOrderOwnedBySupplierOrgTx(tx, row, expectedSup);
      const bScope = options.branchScopeId != null && String(options.branchScopeId).trim() !== "" ? String(options.branchScopeId).trim() : null;
      if (bScope && String(row.branchId || "") !== bScope) {
        throw new AppError("Forbidden", 403);
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
          await trackingService.deactivateSessionsForOrder(orderId, "before_supplier_out_for_delivery");
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
        await trackingService.deactivateSessionsForOrder(orderId, "before_provider_out_for_delivery");
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

function orderIsPickupFromRow(row) {
  if (!row || !row.payload || typeof row.payload !== "object") return false;
  const payload = row.payload;
  const batch = payload.materialBatch && typeof payload.materialBatch === "object" ? payload.materialBatch : {};
  const fromBatch = String(batch.deliveryType || "").toLowerCase();
  if (fromBatch === "pickup") return true;
  if (fromBatch === "delivery") return false;
  return deliveryJobTypeToCanonical(payload.delivery?.type || payload.deliveryType) === "pickup";
}

async function confirmDeliveryReceipt(orderId, customerUserId) {
  const oid = String(orderId || "").trim();
  const trxResult = await prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: oid } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      if (String(row.userId) !== String(customerUserId || "")) {
        throw new AppError("Forbidden", 403);
      }
      const fs = String(row.fulfillmentStatus || "").toUpperCase();
      const pickup = orderIsPickupFromRow(row);

      if (fs === "COMPLETED") {
        const payload = { ...row.payload, deliveryConfirmed: true };
        await tx.materialOrder.update({
          where: { id: oid },
          data: { payload },
        });
        return { mode: "receipt_ack", row, payload };
      }

      if (fs === "READY" && pickup) {
        const ts = new Date().toISOString();
        let payload = { ...row.payload };
        payload = patchPayloadForFulfillmentDelivery(payload, "COMPLETED");
        payload.deliveryConfirmed = true;
        const mb = mergeMaterialBatch(payload, { ...row, fulfillmentStatus: "COMPLETED" }, {
          status: "delivered",
          timestamps: { deliveredAt: ts, pickedUpAt: ts },
        });
        payload.materialBatch = mb;
        await tx.materialOrder.update({
          where: { id: oid },
          data: {
            fulfillmentStatus: "COMPLETED",
            payload,
          },
        });
        return {
          mode: "pickup_to_completed",
          row: { ...row, fulfillmentStatus: "COMPLETED", payload },
          payload,
        };
      }

      throw new AppError("Delivery is not ready to confirm yet", 400);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );

  if (trxResult.mode === "pickup_to_completed") {
    try {
      const fullRow = await prisma.materialOrder.findUnique({ where: { id: oid } });
      if (fullRow) {
        await notifyCustomerFulfillmentStep(fullRow, "COMPLETED");
        const p =
          trxResult.payload && typeof trxResult.payload === "object"
            ? trxResult.payload
            : {};
        emitMaterialOrderFulfillmentToCustomer(fullRow.userId, {
          orderId: oid,
          jobId: fullRow.jobId || null,
          fulfillmentStatus: "COMPLETED",
          materialBatch: p.materialBatch,
        });
      }
    } catch (e) {
      console.error("confirmDeliveryReceipt notify emit", e);
    }
    try {
      await trackingService.deactivateSessionsForOrder(oid, "COMPLETED");
    } catch (e) {
      console.error("confirmDeliveryReceipt tracking cleanup", e);
    }
  }

  const mergedRow =
    trxResult.mode === "pickup_to_completed"
      ? {
          ...trxResult.row,
          fulfillmentStatus: "COMPLETED",
          payload: trxResult.payload,
          id: oid,
        }
      : {
          ...trxResult.row,
          payload: trxResult.payload,
          id: oid,
        };
  return enrichOrderFromDbRow(mergedRow, trxResult.payload);
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

function parseDateBound(value, endOfDay = false) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

async function listMaterialOrdersBySupplier(supplierId, { fulfillmentStatus, from, to, branchId } = {}) {
  const branchFilter = String(branchId || "").trim();
  console.log(
    JSON.stringify({
      ns: "material_order",
      event: "supplier_list_orders",
      supplierId: String(supplierId || ""),
      branchIdFilter: branchFilter || null,
      fulfillmentStatusFilter: fulfillmentStatus ?? null,
      at: new Date().toISOString(),
    })
  );
  const raw =
    fulfillmentStatus !== undefined && fulfillmentStatus !== null && String(fulfillmentStatus).trim() !== ""
      ? String(fulfillmentStatus).toUpperCase()
      : null;
  const statusFilter =
    raw && ALLOWED_STATUS.includes(raw) ? { fulfillmentStatus: raw } : {};
  const fromDate = parseDateBound(from, false);
  const toDate = parseDateBound(to, true);
  const createdAtFilter =
    fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};
  const sid = String(supplierId || "").trim();
  const where = {
    branch: { supplierId: sid },
    ...(branchFilter ? { branchId: branchFilter } : {}),
    ...statusFilter,
    ...createdAtFilter,
  };
  const rows = await prisma.materialOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true, businessName: true } },
      branch: { select: { id: true, name: true } },
    },
  });
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
  const result = rows.map((r) => {
    const base = enrichOrderFromDbRow(
      r,
      r.payload && typeof r.payload === "object" ? r.payload : {}
    );
    const u = uMap.get(r.userId);
    const t = trackMap.get(r.id);
    const fs = String(r.fulfillmentStatus || "").toUpperCase();
    const trackingAllowed = fs === "OUT_FOR_DELIVERY";
    const payload = r.payload && typeof r.payload === "object" ? r.payload : {};
    const customerLocation =
      payload.customerLocation && typeof payload.customerLocation === "object" && !Array.isArray(payload.customerLocation)
        ? payload.customerLocation
        : undefined;
    const customerAddress =
      customerLocation?.address ||
      (payload.materialBatch &&
      typeof payload.materialBatch === "object" &&
      payload.materialBatch.deliveryAddress
        ? String(payload.materialBatch.deliveryAddress)
        : undefined);
    return {
      ...base,
      id: r.id,
      branchId: r.branchId,
      branchName: r.branch?.name ? String(r.branch.name) : undefined,
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      customerLocation,
      customerAddress,
      paymentStatus: r.paymentStatus,
      fulfillmentStatus: r.fulfillmentStatus,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt || ""),
      activeTrackingId: trackingAllowed ? t?.trackingId || undefined : undefined,
      activeTrackingToken: trackingAllowed ? t?.accessToken || undefined : undefined,
    };
  });
  try {
    console.log(
      JSON.stringify({
        ns: "material_order",
        event: "supplier_list_orders_result",
        supplierId: sid,
        count: result.length,
        at: new Date().toISOString(),
      })
    );
  } catch (_) {
    /* ignore */
  }
  return result;
}

async function listMaterialOrdersBySupplierIdsForAdmin(supplierIds) {
  const ids = Array.isArray(supplierIds)
    ? supplierIds.map(String)
    : supplierIds != null && supplierIds !== ""
      ? [String(supplierIds)]
      : [];

  const where = ids.length === 0 ? {} : { branch: { supplierId: { in: ids } } };

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

async function appendSupplierOrderNote(orderId, userId, message, options = {}) {
  const raw = String(message ?? "").trim();
  if (!raw) {
    throw new AppError("Message is required", 400);
  }
  if (raw.length > 2000) {
    throw new AppError("Message is too long", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row) {
        throw new AppError("Material order not found", 404);
      }
      const branchScope = options.branchScopeId != null && String(options.branchScopeId).trim() !== "" ? String(options.branchScopeId).trim() : null;
      const supplierOrg = options.supplierOrgId != null && String(options.supplierOrgId).trim() !== "" ? String(options.supplierOrgId).trim() : null;
      if (branchScope && supplierOrg) {
        await assertOrderOwnedBySupplierOrgTx(tx, row, supplierOrg);
        if (String(row.branchId || "") !== branchScope) {
          throw new AppError("Forbidden", 403);
        }
      } else {
        const supplier = await supplierService.requireSupplierOwnedByUserId(userId);
        await assertOrderOwnedBySupplierOrgTx(tx, row, supplier.id);
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

async function cancelMaterialOrderAsSupplier(orderId, supplierId, supplierUserId, reason, options = {}) {
  const outcome = await prisma.$transaction(
    async (tx) =>
      cancelMaterialOrderInTransaction(tx, {
        orderId,
        actor: "supplier",
        actorUserId: supplierUserId,
        expectedSupplierId: String(supplierId || ""),
        branchScopeId: options.branchScopeId,
        reason: String(reason || "").trim(),
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 }
  );
  try {
    const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
    if (row) {
      await notifyCustomerFulfillmentStep(row, "CANCELLED");
    }
    if (row?.branchId) {
      void branchStaffNotificationService.createForBranchUsers(row.branchId, {
        category: "REFUNDS",
        type: "material_order_cancelled",
        title: "Order cancelled",
        message: `Order #${String(orderId).slice(0, 8)} was cancelled by the store. Reason: ${reason || "—"}`,
        materialOrderId: String(orderId),
      });
    }
    if (row?.supplierId) {
      void notificationService.notifySupplierOrgOwnerMaterialEvent(String(row.supplierId), {
        type: "supplier_material_order_cancelled",
        title: "Order cancelled",
        message: `Order #${String(orderId).slice(0, 8)} was cancelled by the store. Reason: ${reason || "—"}`,
        materialOrderId: String(orderId),
        ...(row.jobId ? { jobId: String(row.jobId) } : {}),
      });
    }
  } catch (e) {
    console.error("notifySupplierCancelMaterialOrder", e);
  }
  await logAudit("material_order.cancel.supplier", {
    userId: supplierUserId,
    metadata: {
      orderId,
      supplierId,
      reason: reason || null,
      refundAmount: outcome.refund.amount,
      refundStatus: outcome.refund.status,
      duplicate: outcome.duplicate,
    },
  });
  return outcome;
}

async function cancelMaterialOrderAsCustomer(orderId, customerUserId, reason) {
  const outcome = await prisma.$transaction(
    async (tx) =>
      cancelMaterialOrderInTransaction(tx, {
        orderId,
        actor: "customer",
        actorUserId: customerUserId,
        reason: String(reason || "").trim() || null,
      }),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 }
  );
  try {
    const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
    if (row) {
      await notifyCustomerFulfillmentStep(row, "CANCELLED");
    }
    if (row?.branchId) {
      void branchStaffNotificationService.createForBranchUsers(row.branchId, {
        category: "REFUNDS",
        type: "material_order_cancelled",
        title: "Order cancelled",
        message: `Order #${String(orderId).slice(0, 8)} was cancelled by the customer.`,
        materialOrderId: String(orderId),
      });
    }
    if (row?.supplierId) {
      void notificationService.notifySupplierOrgOwnerMaterialEvent(String(row.supplierId), {
        type: "supplier_material_order_cancelled",
        title: "Order cancelled",
        message: `Order #${String(orderId).slice(0, 8)} was cancelled by the customer.`,
        materialOrderId: String(orderId),
        ...(row.jobId ? { jobId: String(row.jobId) } : {}),
      });
    }
  } catch (e) {
    console.error("notifyCustomerCancelMaterialOrder", e);
  }
  await logAudit("material_order.cancel.customer", {
    userId: customerUserId,
    metadata: {
      orderId,
      reason: reason || null,
      refundAmount: outcome.refund.amount,
      refundStatus: outcome.refund.status,
      duplicate: outcome.duplicate,
    },
  });
  return outcome;
}

async function emitSupplierMaterialOrderCreated(supplierIdStr, orderId, branchIdOpt, jobIdOpt) {
  try {
    if (!supplierIdStr) return;
    const shortId = `Order #${String(orderId).slice(0, 8)}`;
    const jobIdForNotify =
      jobIdOpt != null && String(jobIdOpt).trim() !== "" ? String(jobIdOpt).trim() : undefined;
    const payload = {
      orderId,
      supplierId: String(supplierIdStr),
      ...(branchIdOpt ? { branchId: String(branchIdOpt) } : {}),
    };
    if (global.io) {
      const row = await prisma.supplier.findUnique({
        where: { id: String(supplierIdStr) },
        select: { userId: true },
      });
      if (row?.userId) {
        global.io.to(String(row.userId)).emit("supplier:material_order:new", payload);
      }
      if (branchIdOpt) {
        global.io.to(`branch:${String(branchIdOpt)}`).emit("supplier:material_order:new", payload);
      }
    }
    if (branchIdOpt) {
      void branchStaffNotificationService.createForBranchUsers(String(branchIdOpt), {
        category: "ORDERS",
        type: "material_order_new",
        title: "New material order",
        message: `${shortId} — open Orders to fulfill.`,
        materialOrderId: String(orderId),
      });
    }
    void notificationService.notifySupplierOrgOwnerMaterialEvent(supplierIdStr, {
      type: "supplier_material_order_new",
      title: "New material order",
      message: `${shortId} — open Orders to fulfill.`,
      materialOrderId: String(orderId),
      ...(jobIdForNotify ? { jobId: jobIdForNotify } : {}),
    });
  } catch (e) {
    console.error("emitSupplierMaterialOrderCreated", e);
  }
}

/**
 * After customer pays job materials for a store: persist MaterialOrder for supplier dashboard & fulfillment.
 * Always uses job meta `storeOrders[].orderId` as the MaterialOrder primary key (one independent row per batch).
 * Idempotent when the same store order id is paid again while the row is not yet completed.
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
  if (!storeOrderId) {
    throw new AppError("jobStoreOrderId is required to create a job material order", 400);
  }

  const byId = await prisma.materialOrder.findUnique({ where: { id: storeOrderId } });
  if (byId) {
    const fs = String(byId.fulfillmentStatus || "").toUpperCase();
    if (fs === "COMPLETED") {
      throw new AppError("Cannot attach payment to completed material order; a new store order id is required", 409);
    }
    if (String(byId.userId || "") !== String(customerUserId)) {
      throw new AppError("Material order customer mismatch", 403);
    }
    if (byId.jobId && String(byId.jobId) !== String(jobId)) {
      throw new AppError("Material order job mismatch", 400);
    }
    const branchRef = await prisma.branch.findUnique({ where: { id: sid }, select: { supplierId: true } });
    const branchOk =
      String(byId.branchId || "") === sid ||
      (branchRef && String(byId.supplierId || "") === String(branchRef.supplierId));
    if (!branchOk) {
      throw new AppError("Material order supplier mismatch", 400);
    }
    const row = byId;
    console.log(
      JSON.stringify({
        ns: "material_order",
        event: "ensure_job_material_order_idempotent",
        materialOrderId: row.id,
        jobId: String(jobId),
        storeOrderId,
        at: new Date().toISOString(),
      })
    );
    return enrichOrderFromDbRow(
      row,
      row.payload && typeof row.payload === "object" ? row.payload : {}
    );
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

  const branch = await prisma.branch.findUnique({
    where: { id: sid },
    include: { supplier: true },
  });
  if (!branch) {
    throw new AppError("Branch not found", 400);
  }
  const orgId = branch.supplierId;
  const pickupAddr = branch.address ? String(branch.address) : "";

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

  const finalPayload = {
    ...order,
    storeName: branchService.branchPublicDisplay(branch, branch.supplier) || lines[0]?.supplierName || order.storeName,
    invoiceId: invoiceId || order.invoiceId,
    jobStoreOrderId: storeOrderId || order.id,
  };
  finalPayload.materialBatch = mergeMaterialBatch(
    finalPayload,
    { id: prismaRow.id, branchId: sid, supplierId: orgId, fulfillmentStatus: "PENDING" },
    {
      status: "pending",
    }
  );
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
      supplierId: orgId,
      branchId: sid,
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

  console.log(
    JSON.stringify({
      ns: "material_order",
      event: "job_material_order_created",
      materialOrderId: prismaRow.id,
      jobId: String(jobId),
      branchId: sid,
      supplierOrgId: orgId,
      storeOrderId,
      at: new Date().toISOString(),
    })
  );

  await emitSupplierMaterialOrderCreated(orgId, prismaRow.id, sid, prismaRow.jobId);
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
      ? { branch: { supplierId: String(supplierId) } }
      : {}),
  };
  const rows = await prisma.materialOrder.findMany({
    where,
    select: { materialsSubtotal: true, payload: true, platformCommission: true },
  });
  let totalRevenue = 0;
  let totalCommission = 0;
  for (const row of rows) {
    totalRevenue += orderTotalFromRow(row);
    totalCommission += Number(row.platformCommission || 0);
  }
  totalRevenue = roundMoney2(totalRevenue);
  const orderCount = rows.length;
  totalCommission = roundMoney2(totalCommission);
  const averageOrderValue = orderCount > 0 ? roundMoney2(totalRevenue / orderCount) : 0;
  return {
    orderCount,
    totalRevenue,
    totalCommission,
    averageOrderValue,
    commissionRate: ADMIN_ANALYTICS_COMMISSION_RATE,
  };
}

function computeSupplierExportFinancials(order) {
  const status = String(order.fulfillmentStatus || "").toUpperCase();
  const totalAmount = roundMoney2(Number(order.total ?? order.materialsSubtotal ?? 0));
  const commission = roundMoney2(totalAmount * 0.07);
  const netEarnings = roundMoney2(totalAmount - commission);
  const cancelled = status === "CANCELLED";
  const cancelledBy = String(order.cancelledBy || "").toLowerCase();
  const completedPaid = status === "COMPLETED" && String(order.paymentStatus || "").toLowerCase() === "paid";

  if (cancelled) {
    return {
      totalAmount,
      commission,
      netEarnings,
      revenueImpact: roundMoney2(-totalAmount),
      commissionImpact: cancelledBy === "supplier" ? roundMoney2(-commission) : commission,
      netImpact: roundMoney2(-netEarnings),
    };
  }
  if (!completedPaid) {
    return {
      totalAmount,
      commission,
      netEarnings,
      revenueImpact: 0,
      commissionImpact: 0,
      netImpact: 0,
    };
  }
  return {
    totalAmount,
    commission,
    netEarnings,
    revenueImpact: totalAmount,
    commissionImpact: commission,
    netImpact: netEarnings,
  };
}

async function buildSupplierOrdersExport(supplierId, { from, to, branchId } = {}) {
  const orders = await listMaterialOrdersBySupplier(supplierId, { from, to, branchId });
  const rows = orders.map((o) => {
    const fx = computeSupplierExportFinancials(o);
    return {
      orderId: o.id,
      branchName: o.branchName != null && String(o.branchName).trim() ? String(o.branchName).trim() : null,
      status: String(o.fulfillmentStatus || "PENDING"),
      totalAmount: fx.totalAmount,
      commission: fx.commission,
      netEarnings: fx.netEarnings,
      revenueImpact: fx.revenueImpact,
      commissionImpact: fx.commissionImpact,
      netImpact: fx.netImpact,
      isCancelled: String(o.fulfillmentStatus || "").toUpperCase() === "CANCELLED",
      cancellationReason: o.cancellationReason || null,
      cancelledBy: o.cancelledBy || null,
      createdAt: o.createdAt || null,
      refundAmount: Number(o.refundAmount || 0),
      refundStatus: o.refundStatus || null,
    };
  });
  const summary = rows.reduce(
    (acc, row) => {
      acc.orderCount += 1;
      acc.totalRevenueImpact = roundMoney2(acc.totalRevenueImpact + row.revenueImpact);
      acc.totalCommissionImpact = roundMoney2(acc.totalCommissionImpact + row.commissionImpact);
      acc.totalNetImpact = roundMoney2(acc.totalNetImpact + row.netImpact);
      if (row.isCancelled) acc.cancelledCount += 1;
      return acc;
    },
    { orderCount: 0, cancelledCount: 0, totalRevenueImpact: 0, totalCommissionImpact: 0, totalNetImpact: 0 }
  );
  return { rows, summary };
}

/** Recent material orders for admin supplier view (newest first). */
async function listRecentMaterialOrdersBySupplierForAdmin(supplierId, { limit = 10 } = {}) {
  const sid = String(supplierId || "").trim();
  if (!sid) {
    throw new AppError("supplierId is required", 400);
  }
  const take = Math.min(50, Math.max(1, Number(limit) || 10));
  const rows = await prisma.materialOrder.findMany({
    where: { branch: { supplierId: sid } },
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

/**
 * Idempotent: ensure an active supplier-led tracking session for store delivery while OUT_FOR_DELIVERY.
 */
async function ensureStoreDeliveryTrackingSession(orderId, supplierStoreId, options = {}) {
  const oid = String(orderId || "");
  const sid = String(supplierStoreId || "");
  if (!oid || !sid) throw new AppError("Invalid order", 400);
  const row = await prisma.materialOrder.findUnique({ where: { id: oid } });
  if (!row) throw new AppError("Material order not found", 404);
  await assertOrderOwnedBySupplierOrg(row, sid);
  const bScope = options.branchScopeId != null && String(options.branchScopeId).trim() !== "" ? String(options.branchScopeId).trim() : null;
  if (bScope && String(row.branchId || "") !== bScope) {
    throw new AppError("Forbidden", 403);
  }
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  if (String(payload.deliveryType || "").toUpperCase() !== "STORE_DELIVERY") {
    throw new AppError("Tracking session applies to store delivery orders", 400);
  }
  if (String(row.fulfillmentStatus || "").toUpperCase() !== "OUT_FOR_DELIVERY") {
    throw new AppError("Order must be out for delivery to start tracking", 400);
  }
  await trackingService.expireOldSessions();
  const existing = await prisma.trackingSession.findFirst({
    where: { orderId: oid, isActive: true },
  });
  if (existing) {
    return {
      activeTrackingId: existing.trackingId,
      activeTrackingToken: existing.accessToken || undefined,
    };
  }
  const singleUse = process.env.TRACKING_ACCESS_TOKEN_SINGLE_USE === "true";
  const { trackingId, accessToken } = await trackingService.createActiveTrackingSession(oid, {
    trackingSource: "supplier",
    accessTokenSingleUse: singleUse,
  });
  return { activeTrackingId: trackingId, activeTrackingToken: accessToken };
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
  buildSupplierOrdersExport,
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
  cancelMaterialOrderAsSupplier,
  cancelMaterialOrderAsCustomer,
  listMaterialOrdersBySupplier,
  listMaterialOrdersBySupplierIdsForAdmin,
  listAllMaterialOrdersForAdmin,
  ensureStoreDeliveryTrackingSession,
  normalizeOrder,
  ensureJobMaterialPurchaseOrder,
  getJobMaterialOrdersForJob,
  emitSupplierMaterialOrderCreated,
};
