const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const supplierService = require("./supplier.service");
const notificationService = require("./notification.service");
const trackingService = require("./tracking.service");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
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

/** Assigned courier userId from order payload (not the job's service provider). */
function resolveAssignedCourierId(payload) {
  if (!payload || typeof payload !== "object") return "";
  const batch =
    payload.materialBatch && typeof payload.materialBatch === "object" ? payload.materialBatch : {};
  return String(
    batch.assignedDriverId || payload.deliveryProviderId || payload.delivery?.providerId || ""
  ).trim();
}

/** Courier id from API may be provider user id or provider profile id. */
async function resolveCourierUserId(rawId) {
  const id = String(rawId || "").trim();
  if (!id) return "";
  const asUser = await prisma.user.findFirst({
    where: { id, role: "PROVIDER" },
    select: { id: true },
  });
  if (asUser) return asUser.id;
  const profile = await prisma.provider.findFirst({
    where: { OR: [{ id }, { userId: id }] },
    select: { userId: true },
  });
  return profile?.userId ? String(profile.userId) : id;
}

/**
 * Resolve a Branch row for courier material orders (storeId may be branch id or supplier org id).
 */
async function resolveBranchForCourierDelivery(supplierBranchId, materialsLines = []) {
  const candidates = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };
  push(supplierBranchId);
  for (const line of materialsLines) {
    push(line.branchId);
    push(line.supplierId);
  }
  for (const id of candidates) {
    const direct = await prisma.branch.findUnique({
      where: { id },
      include: { supplier: true },
    });
    if (direct) return direct;
    const byOrg = await prisma.branch.findFirst({
      where: { supplierId: id },
      include: { supplier: true },
      orderBy: { createdAt: "asc" },
    });
    if (byOrg) return byOrg;
  }
  return null;
}

function buildGeoPoint({ address, city, area, suburb, coordinates, label } = {}) {
  const point = {
    address: address != null ? String(address).trim() : "",
    city: city != null ? String(city).trim() : undefined,
    area: area != null ? String(area).trim() : undefined,
    suburb: suburb != null ? String(suburb).trim() : undefined,
    label: label != null ? String(label).trim() : undefined,
  };
  if (
    coordinates &&
    typeof coordinates === "object" &&
    Number.isFinite(Number(coordinates.lat)) &&
    Number.isFinite(Number(coordinates.lng))
  ) {
    point.coordinates = { lat: Number(coordinates.lat), lng: Number(coordinates.lng) };
  }
  return point;
}

/**
 * Resolve collection (branch/store) and destination (job site) geo points for courier material delivery.
 */
async function resolveCourierDeliveryGeoPoints({
  storeOrderBranchId,
  supplierBranchId,
  materialsLines = [],
  jobProviderUserId = null,
  jobSiteAddress = "",
  jobSiteLocation = null,
} = {}) {
  const branch = await resolveBranchForCourierDelivery(
    storeOrderBranchId || supplierBranchId,
    materialsLines
  );
  if (!branch) return null;

  const pickupAddr = branch.address ? String(branch.address).trim() : "";
  const collectionPointLabel =
    branchService.branchPublicDisplay(branch, branch.supplier) || "Collection point";

  if (!pickupAddr) {
    const storeLabel = collectionPointLabel || branch.name || "Store";
    throw new AppError(
      `Store pickup address is required before courier delivery can be arranged (${storeLabel}). Please ask the supplier to update their branch address.`,
      400
    );
  }

  const collectionPoint = buildGeoPoint({
    address: pickupAddr,
    city: branch.city || branch.supplier?.city,
    area: branch.area,
    coordinates:
      branch.latitude != null && branch.longitude != null
        ? { lat: Number(branch.latitude), lng: Number(branch.longitude) }
        : undefined,
    label: collectionPointLabel,
  });
  const destinationPoint = buildGeoPoint({
    address: String(jobSiteLocation?.address || jobSiteAddress || ""),
    city: jobSiteLocation?.city,
    area: jobSiteLocation?.area,
    suburb: jobSiteLocation?.suburb,
    coordinates: jobSiteLocation?.coordinates,
    label: "Delivery destination",
  });

  return { branch, pickupAddr, collectionPointLabel, collectionPoint, destinationPoint };
}

function applyCourierGeoPointsToPayload(payload, geo) {
  if (!geo || !payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  next.materialBatch = mergeMaterialBatch(
    next,
    {
      id: next.id || next.jobStoreOrderId,
      branchId: geo.branch?.id,
      supplierId: geo.branch?.supplierId,
    },
    { status: next.materialBatch?.status || "pending" }
  );
  next.materialBatch.pickupAddress = geo.pickupAddr;
  next.materialBatch.deliveryAddress = String(geo.destinationPoint?.address || "");
  next.collectionPoint = geo.collectionPoint;
  next.destinationPoint = geo.destinationPoint;
  return next;
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
  if (row.userId) p.userId = String(row.userId);
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
  p.finance = supplierService.buildOrderFinanceBreakdown({
    ...p,
    paymentStatus: row.paymentStatus,
    platformCommission: row.platformCommission != null ? Number(row.platformCommission) : p.platformCommission,
    supplierEarning: row.supplierEarning != null ? Number(row.supplierEarning) : p.supplierEarning,
  });
  return p;
}

function coerceAmt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function coerceNumber(v, d = 0) {
  return coerceAmt(v, d);
}

function normalizeDeliveryStatus(status) {
  const s = String(status || "Processing").trim();
  const allowed = new Set([
    "SelfCollect",
    "PendingApproval",
    "Quoted",
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

function defaultDeliveryStatusForType(delivery) {
  const delType = String(delivery?.type || "SELF").toUpperCase();
  if (delType === "SELF") return "SelfCollect";
  if (delType === "STORE" && Number(delivery?.fee || 0) <= 0) return "PendingApproval";
  if (delType === "PROVIDER") return "PendingApproval";
  return "Processing";
}

/** Store delivery waiting for branch to set a delivery fee (quote workflow). */
function storeDeliveryAwaitingBranchQuote(payload) {
  const dt = String(payload?.deliveryType || "").toUpperCase();
  if (dt !== "STORE_DELIVERY") return false;
  if (payload?.payment?.deliveryPaid === true) return false;
  const dStatus = normalizeDeliveryStatus(payload?.delivery?.status);
  if (dStatus === "Rejected") return false;
  if (dStatus === "Approved") return false;
  const fee = Number(payload?.deliveryFee ?? payload?.delivery?.fee ?? payload?.deliveryQuote?.fee ?? 0);
  if (fee > 0) return false;
  return true;
}

/** Block store dispatch until customer pays quoted delivery fee (mirrors courier pay gate). */
function assertStoreDeliveryPaidBeforeDispatch(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const dt = String(p.deliveryType || "").toUpperCase();
  if (dt !== "STORE_DELIVERY") return;
  const fee = Math.max(
    0,
    Number(p.deliveryFee ?? p.delivery?.fee ?? p.deliveryQuote?.fee ?? 0) || 0
  );
  if (fee <= 0) return;
  if (p.payment?.deliveryPaid === true) return;
  throw new AppError("Customer must pay the delivery fee before dispatch", 409);
}

/** Keep job meta storeOrders in sync when material order delivery is quoted / paid / reset. */
async function syncJobStoreOrderDeliveryFromMaterialOrder(row, payload) {
  const jobId = row?.jobId ? String(row.jobId).trim() : "";
  if (!jobId) return;
  const p = payload && typeof payload === "object" ? payload : {};
  const storeOrderId = String(p.jobStoreOrderId || "").trim();
  if (!storeOrderId) return;

  const dt = String(p.deliveryType || "").toUpperCase();
  const deliveryType =
    dt === "STORE_DELIVERY" ? "STORE" : dt === "DELIVERY_PROVIDER" ? "PROVIDER" : "SELF";
  const dStatus = normalizeDeliveryStatus(p.delivery?.status);
  const deliveryFee = Math.max(0, Number(p.deliveryFee ?? p.delivery?.fee ?? 0) || 0);
  const deliveryPaid = p.payment?.deliveryPaid === true;

  let deliveryStatus = "PendingApproval";
  if (deliveryType === "SELF") {
    deliveryStatus = "SelfCollect";
  } else if (dStatus === "Rejected") {
    deliveryStatus = "Rejected";
  } else if (dStatus === "Cancelled") {
    deliveryStatus = "Cancelled";
  } else if (deliveryPaid && ["Processing", "InProgress", "OnTheWay", "Delivered"].includes(dStatus)) {
    deliveryStatus = dStatus;
  } else if (dStatus === "Approved" || (deliveryFee > 0 && deliveryType === "STORE")) {
    deliveryStatus = "Approved";
  } else if (dStatus === "Quoted") {
    deliveryStatus = "Quoted";
  } else if (dStatus) {
    deliveryStatus = dStatus;
  }

  try {
    const { mutateJobMeta } = require("./jobMeta.service");
    await mutateJobMeta(jobId, (m) => {
      const list = Array.isArray(m.storeOrders) ? [...m.storeOrders] : [];
      const idx = list.findIndex((o) => String(o.orderId) === storeOrderId);
      if (idx < 0) return m;
      const prev = list[idx];
      list[idx] = {
        ...prev,
        deliveryType,
        deliveryFee,
        deliveryStatus,
        delivery: {
          ...(prev.delivery || {}),
          type: deliveryType,
          status: deliveryStatus,
          fee: deliveryFee,
          providerId: p.deliveryProviderId || prev.deliveryProviderId || prev.delivery?.providerId,
        },
        payment: {
          ...(prev.payment || {}),
          materialsPaid: p.payment?.materialsPaid !== false,
          deliveryPaid,
        },
      };
      return { ...m, storeOrders: list };
    });
  } catch (e) {
    console.error("syncJobStoreOrderDeliveryFromMaterialOrder", jobId, storeOrderId, e);
  }
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
    paymentStatus:
      input.paymentStatus === "paid" || input.paymentStatus === "unpaid"
        ? String(input.paymentStatus)
        : "unpaid",
    deliveryStatus:
      delivery.status === "Delivered"
        ? "delivered"
        : delivery.status === "InProgress"
          ? "out_for_delivery"
          : "processing",
    delivery: {
      type: delivery.type || "SELF",
      status: normalizeDeliveryStatus(delivery.status ?? defaultDeliveryStatusForType(delivery)),
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
        : "unpaid",
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

  if (clean.paymentIntentId) {
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: String(clean.paymentIntentId) },
    });
    if (!intent || intent.state !== "PAID") {
      throw new AppError("Valid paid payment intent is required", 400);
    }
    if (String(intent.userId) !== String(prismaRow.userId)) {
      throw new AppError("Payment intent does not belong to this user", 403);
    }
    prismaRow.paymentStatus = "paid";
    order.paymentStatus = "paid";
  }
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
  const pickupAddr = branch.address ? String(branch.address) : "";
  nextPayload.materialBatch.pickupAddress = pickupAddr;
  nextPayload.materialBatch.deliveryAddress = String(order.customerLocation?.address || "");
  if (order.delivery?.providerId) {
    nextPayload.materialBatch.assignedDriverId = String(order.delivery.providerId);
  }
  nextPayload.collectionPoint = buildGeoPoint({
    address: pickupAddr,
    city: branch.city,
    area: branch.area,
    coordinates:
      branch.latitude != null && branch.longitude != null
        ? { lat: Number(branch.latitude), lng: Number(branch.longitude) }
        : undefined,
    label: branchService.branchPublicDisplay(branch, branch.supplier) || "Collection point",
  });
  nextPayload.destinationPoint = buildGeoPoint({
    address: order.customerLocation?.address,
    city: order.customerLocation?.city,
    area: order.customerLocation?.area,
    suburb: order.customerLocation?.suburb,
    coordinates: order.customerLocation?.coordinates,
    label: "Delivery destination",
  });
  if (String(order.delivery?.type || "").toUpperCase() === "PROVIDER" && order.delivery?.providerId) {
    nextPayload.delivery = {
      ...(nextPayload.delivery || {}),
      type: "PROVIDER",
      status: "PendingApproval",
      providerId: String(order.delivery.providerId),
      fee: 0,
    };
  }
  delete nextPayload.activeTrackingId;
  delete nextPayload.activeTrackingToken;
  delete nextPayload.driverLocation;

  const created = await prisma.materialOrder.create({
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

  if (clean.paymentIntentId) {
    await prisma.paymentIntent.update({
      where: { id: String(clean.paymentIntentId) },
      data: { materialOrderId: created.id },
    });
  }
  try {
    await emitSupplierMaterialOrderCreated(orgId, prismaRow.id, branchId, prismaRow.jobId);
  } catch (_) {
    /* non-fatal socket */
  }
  if (String(order.delivery?.type || "").toUpperCase() === "PROVIDER" && order.delivery?.providerId) {
    await notifyAssignedCourier(prismaRow.id, order.delivery.providerId);
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

function isDeliveryRequestPaid(dr) {
  if (!dr) return false;
  const status = String(dr.status || "").toLowerCase();
  if (["paid", "in_transit", "completed"].includes(status)) return true;
  const drPayload = dr.payload && typeof dr.payload === "object" ? dr.payload : {};
  return drPayload.payment?.deliveryPaid === true;
}

function resolveEffectiveDeliveryStatus(moPayload, dr, courierJob, moFulfillmentStatus) {
  const current = normalizeDeliveryStatus(moPayload?.delivery?.status);
  const drFs = String(dr?.fulfillmentStatus || "").toUpperCase();
  const jobStatus = String(courierJob?.status || "").toUpperCase();
  const moFs = String(moFulfillmentStatus || "").toUpperCase();

  if (drFs === "COMPLETED" || jobStatus === "COMPLETED" || moFs === "COMPLETED") {
    return "Delivered";
  }
  if (drFs === "OUT_FOR_DELIVERY" || jobStatus === "IN_PROGRESS") {
    return "InProgress";
  }
  if (isDeliveryRequestPaid(dr)) {
    if (["Quoted", "Approved"].includes(current)) return "Processing";
  }
  const drStatus = String(dr?.status || "").toLowerCase();
  if (drStatus === "approved" && current === "Quoted") return "Approved";
  return current;
}

async function reconcileMaterialOrderWithDeliveryContext(row, base, deliveryRequestRow) {
  if (!deliveryRequestRow) return base;

  let courierJob = null;
  if (deliveryRequestRow.jobId) {
    courierJob = await prisma.job.findUnique({
      where: { id: String(deliveryRequestRow.jobId) },
      select: { id: true, status: true },
    });
    base.courierJobId = String(deliveryRequestRow.jobId);
  }

  const drPaid = isDeliveryRequestPaid(deliveryRequestRow);
  const moPaid = base.payment?.deliveryPaid === true;
  const effectivePaid = moPaid || drPaid;
  const currentStatus = normalizeDeliveryStatus(base.delivery?.status);
  const effectiveStatus = resolveEffectiveDeliveryStatus(
    base,
    deliveryRequestRow,
    courierJob,
    row.fulfillmentStatus
  );
  const drFee =
    deliveryRequestRow.quotedFee != null && Number(deliveryRequestRow.quotedFee) > 0
      ? Number(deliveryRequestRow.quotedFee)
      : null;
  const effectiveFee =
    drFee != null ? drFee : Number(base.deliveryFee ?? base.delivery?.fee ?? 0);

  base.payment = {
    ...(base.payment || {}),
    materialsPaid: base.payment?.materialsPaid !== false,
    deliveryPaid: effectivePaid,
  };
  base.delivery = {
    ...(base.delivery || {}),
    status: effectiveStatus,
    fee: effectiveFee,
  };
  if (effectiveFee > 0) {
    base.deliveryFee = effectiveFee;
  }
  if (effectiveStatus === "Delivered") {
    base.deliveryStatus = "delivered";
  } else if (effectiveStatus === "InProgress" || effectiveStatus === "OnTheWay") {
    base.deliveryStatus = "out_for_delivery";
  }

  const deliveryType = String(row.deliveryType || base.deliveryType || "").toUpperCase();
  const needsRepair =
    deliveryType === "DELIVERY_PROVIDER" &&
    (effectivePaid !== moPaid || effectiveStatus !== currentStatus || (drFee != null && drFee !== Number(base.deliveryFee ?? 0)));

  if (needsRepair) {
    try {
      let repairedPayload = {
        ...(row.payload && typeof row.payload === "object" ? row.payload : {}),
        deliveryFee: effectiveFee,
        payment: base.payment,
        delivery: base.delivery,
        deliveryStatus: base.deliveryStatus,
      };
      const moFs = String(row.fulfillmentStatus || "").toUpperCase();
      if (effectiveStatus === "Delivered" && moFs !== "COMPLETED") {
        repairedPayload = patchPayloadForFulfillmentDelivery(repairedPayload, "COMPLETED");
      }
      await prisma.materialOrder.update({
        where: { id: row.id },
        data: { payload: repairedPayload },
      });
    } catch (e) {
      console.error("reconcileMaterialOrderWithDeliveryContext repair", row.id, e);
    }
  }

  return base;
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

  const deliveryRequest = await prisma.deliveryRequest.findFirst({
    where: { materialOrderId: String(orderId) },
    orderBy: { createdAt: "desc" },
  });
  if (deliveryRequest) {
    await reconcileMaterialOrderWithDeliveryContext(row, base, deliveryRequest);
  }

  try {
    const rating = await prisma.materialOrderRating.findUnique({
      where: { orderId: String(orderId) },
      select: { rating: true, comment: true, createdAt: true },
    });
    if (rating) {
      base.customerRating = {
        rating: rating.rating,
        comment: rating.comment != null ? String(rating.comment) : undefined,
        createdAt:
          rating.createdAt instanceof Date ? rating.createdAt.toISOString() : String(rating.createdAt || ""),
      };
    }
  } catch (e) {
    console.error("getMaterialOrderById customerRating", orderId, e);
  }

  return base;
}

function jobSiteAddressFromRow(job) {
  const loc = job?.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const parts = [loc.address, loc.suburb, loc.area, loc.city].filter(Boolean).map(String);
    if (parts.length) return parts.join(", ");
  }
  const l = job?.location;
  if (l && String(l).trim() && String(l).trim() !== "UNKNOWN") return String(l).trim();
  return "";
}

function jobSiteLocationFromRow(job) {
  const loc = job?.locationDetails;
  const address = jobSiteAddressFromRow(job);
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const coords =
      loc.coordinates &&
      typeof loc.coordinates === "object" &&
      Number.isFinite(Number(loc.coordinates.lat)) &&
      Number.isFinite(Number(loc.coordinates.lng))
        ? { lat: Number(loc.coordinates.lat), lng: Number(loc.coordinates.lng) }
        : Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
          ? { lat: Number(loc.lat), lng: Number(loc.lng) }
          : undefined;
    return {
      address,
      city: loc.city ? String(loc.city) : undefined,
      area: loc.area ? String(loc.area) : undefined,
      suburb: loc.suburb ? String(loc.suburb) : undefined,
      coordinates: coords,
    };
  }
  return { address };
}

/**
 * Create or reactivate a courier child job for a job-attached material order
 * (used when customer re-selects a provider via standalone OrderDetails).
 */
async function ensureCourierJobForMaterialOrder(materialOrderId) {
  const orderId = String(materialOrderId || "").trim();
  if (!orderId) return null;

  const moRow = await prisma.materialOrder.findUnique({
    where: { id: orderId },
    include: {
      branch: { select: { id: true, name: true } },
      supplier: { select: { name: true, businessName: true } },
    },
  });
  if (!moRow?.jobId) return null;

  const payload = moRow.payload && typeof moRow.payload === "object" ? moRow.payload : {};
  const deliveryType = String(payload.deliveryType || "").toUpperCase();
  const delType = String(payload.delivery?.type || "").toUpperCase();
  if (deliveryType !== "DELIVERY_PROVIDER" && delType !== "PROVIDER") return null;

  const courierUserId = resolveAssignedCourierId(payload);
  if (!courierUserId) return null;

  const parentJob = await prisma.job.findUnique({ where: { id: String(moRow.jobId) } });
  if (!parentJob) return null;

  const jobSiteAddr = jobSiteAddressFromRow(parentJob);
  const jobSiteLoc = jobSiteLocationFromRow(parentJob);

  let collectionPoint =
    payload.collectionPoint ||
    (payload.materialBatch?.pickupAddress
      ? { address: String(payload.materialBatch.pickupAddress), label: "Collection point" }
      : null);
  let destinationPoint =
    payload.destinationPoint ||
    (payload.materialBatch?.deliveryAddress
      ? { address: String(payload.materialBatch.deliveryAddress), label: "Delivery destination" }
      : null);

  const items = Array.isArray(payload.items) ? payload.items : [];
  const materialsLines = items.map((item) => ({
    supplierId: String(moRow.branchId || moRow.supplierId || ""),
    branchId: moRow.branchId,
    productId: item.productId,
    name: item.name,
    qty: item.qty ?? item.quantity,
    unitPrice: item.unitPrice ?? item.price,
  }));

  if (!collectionPoint?.address || !destinationPoint?.address) {
    const geo = await resolveCourierDeliveryGeoPoints({
      storeOrderBranchId: moRow.branchId,
      supplierBranchId: moRow.branchId || moRow.supplierId,
      materialsLines,
      jobProviderUserId: parentJob.providerId,
      jobSiteAddress: jobSiteAddr,
      jobSiteLocation: jobSiteLoc,
    });
    if (geo) {
      if (!collectionPoint?.address) collectionPoint = geo.collectionPoint;
      if (!destinationPoint?.address) destinationPoint = geo.destinationPoint;
    }
  }

  if (!collectionPoint?.address) {
    throw new AppError(
      "Store pickup address is required before courier delivery can be arranged. Please ask the supplier to update their branch address.",
      400
    );
  }

  const storeName =
    moRow.branch?.name ||
    payload.storeName ||
    moRow.supplier?.businessName ||
    moRow.supplier?.name ||
    "Store";

  const deliveryRequestService = require("./deliveryRequest.service");
  const { courierJobId } = await deliveryRequestService.ensureMaterialCourierJobRequest({
    parentJobId: parentJob.id,
    materialOrderId: orderId,
    courierUserId,
    customerUserId: moRow.userId,
    collectionPoint,
    destinationPoint: destinationPoint?.address
      ? destinationPoint
      : { address: jobSiteAddr, ...jobSiteLoc },
    items,
    storeName,
    parentJobTitle: parentJob.title,
  });

  if (courierJobId) {
    const { mutateJobMeta } = require("./jobMeta.service");
    await mutateJobMeta(parentJob.id, (m) => {
      const list = Array.isArray(m.storeOrders) ? m.storeOrders : [];
      const idx = list.findIndex((o) => String(o.orderId) === orderId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], courierJobId: String(courierJobId) };
        m.storeOrders = list;
      }
      return m;
    });
  }

  return { courierJobId };
}

function assertDeliveryChangeAllowed(row, current, updates = {}) {
  if (updates.status && normalizeDeliveryStatus(updates.status) === "Cancelled") return;
  const fulfillment = String(row.fulfillmentStatus || current.fulfillmentStatus || "").toUpperCase();
  if (["OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"].includes(fulfillment)) {
    throw new AppError("Delivery option cannot be changed after dispatch", 409);
  }
  const dStatus = normalizeDeliveryStatus(current.delivery?.status);
  if (["InProgress", "OnTheWay", "Delivered"].includes(dStatus)) {
    throw new AppError("Delivery option cannot be changed while in transit", 409);
  }
  if (current.payment?.deliveryPaid === true && updates.type) {
    throw new AppError("Cancel or refund delivery payment before changing delivery option", 409);
  }
}

async function updateMaterialOrderDelivery(orderId, updates = {}) {
  const rowBefore = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  const prevPayload =
    rowBefore?.payload && typeof rowBefore.payload === "object" ? rowBefore.payload : {};
  const prevProviderId = prevPayload.deliveryProviderId || prevPayload.delivery?.providerId;

  const result = await prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      const current = row.payload;
      assertDeliveryChangeAllowed(row, current, updates);
      const prevDeliveryType = String(current.delivery?.type || "").toUpperCase();
      const nextTypeRaw = updates.type != null ? String(updates.type).toUpperCase() : prevDeliveryType;
      const typeChanging = updates.type != null && nextTypeRaw !== prevDeliveryType;

      let nextDelivery = {
        ...(current.delivery || {}),
        ...(updates || {}),
        status: updates.status ? normalizeDeliveryStatus(updates.status) : current.delivery?.status,
      };

      if (typeChanging) {
        delete current.deliveryQuote;
        delete current.deliveryRejection;
        if (nextTypeRaw === "SELF") {
          nextDelivery = { type: "SELF", status: "SelfCollect", fee: 0 };
        } else if (nextTypeRaw === "STORE") {
          nextDelivery = {
            type: "STORE",
            status: "PendingApproval",
            fee: 0,
            providerId: undefined,
          };
        } else if (nextTypeRaw === "PROVIDER") {
          nextDelivery = {
            type: "PROVIDER",
            status: "PendingApproval",
            fee: 0,
            providerId: updates.providerId || undefined,
          };
        }
      }

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
        deliveryFee: typeChanging ? 0 : Number(nextDelivery.fee ?? current.deliveryFee ?? 0),
        deliveryStatus:
          nextDelivery.status === "Delivered"
            ? "delivered"
            : nextDelivery.status === "InProgress"
              ? "out_for_delivery"
              : "processing",
      };
      if (typeChanging) {
        delete next.deliveryQuote;
        delete next.deliveryRejection;
        next.total = Number(next.materialsSubtotal ?? 0);
      }
      if (updates.type && next.materialBatch && typeof next.materialBatch === "object") {
        next.materialBatch = {
          ...next.materialBatch,
          deliveryType: deliveryJobTypeToCanonical(nextDelivery.type || "SELF"),
        };
      }
      await tx.materialOrder.update({
        where: { id: orderId },
        data: { payload: next },
      });
      return enrichOrderFromDbRow(row, next);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  );

  const isCancelled =
    updates.status && normalizeDeliveryStatus(updates.status) === "Cancelled";
  const providerChanged =
    updates.providerId !== undefined &&
    prevProviderId &&
    String(updates.providerId) !== String(prevProviderId);
  const isProviderDelivery =
    String(result.deliveryType || "").toUpperCase() === "DELIVERY_PROVIDER" ||
    String(prevPayload.deliveryType || "").toUpperCase() === "DELIVERY_PROVIDER";

  if (isCancelled || (providerChanged && isProviderDelivery)) {
    try {
      const deliveryRequestService = require("./deliveryRequest.service");
      if (isCancelled) {
        await deliveryRequestService.cancelCourierDeliveryForCustomer({
          materialOrderId: orderId,
          source: "customer_cancel",
        });
      } else {
        await deliveryRequestService.cancelCourierDeliveryForCustomer({
          materialOrderId: orderId,
          source: "customer_changed_provider",
          resetDeliveryRequest: true,
        });
      }
    } catch (e) {
      console.error("updateMaterialOrderDelivery cancelCourier", orderId, e);
    }
  }

  const selectingProvider =
    !isCancelled &&
    rowBefore?.jobId &&
    (updates.type === "PROVIDER" ||
      String(result.deliveryType || "").toUpperCase() === "DELIVERY_PROVIDER") &&
    (updates.providerId || result.deliveryProviderId);

  if (selectingProvider) {
    try {
      await ensureCourierJobForMaterialOrder(orderId);
    } catch (e) {
      console.error("updateMaterialOrderDelivery ensureCourierJob", orderId, e);
      throw e instanceof AppError ? e : new AppError("Failed to assign delivery provider", 500);
    }
  }

  await syncJobStoreOrderDeliveryFromMaterialOrder(rowBefore, result);
  return result;
}

async function approveMaterialOrderDeliveryBySupplier(orderId, supplierId, options = {}) {
  const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!row) throw new AppError("Material order not found", 404);
  await assertOrderOwnedBySupplierOrg(row, supplierId);
  const bScope = options.branchScopeId != null && String(options.branchScopeId).trim() !== "" ? String(options.branchScopeId).trim() : null;
  if (bScope && String(row.branchId || "") !== bScope) {
    throw new AppError("Forbidden", 403);
  }
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const dt = String(payload.deliveryType || "").toUpperCase();
  if (dt !== "STORE_DELIVERY") {
    throw new AppError("Only store delivery requests can be approved here", 400);
  }
  const dStatus = normalizeDeliveryStatus(payload.delivery?.status);
  if (dStatus === "Approved" && payload.payment?.deliveryPaid !== true) {
    const existingFee = Number(payload.deliveryFee ?? payload.delivery?.fee ?? 0);
    if (existingFee > 0) {
      return enrichOrderFromDbRow(row, payload);
    }
  }
  if (!storeDeliveryAwaitingBranchQuote(payload)) {
    throw new AppError("Delivery is not awaiting branch approval", 400);
  }
  const safeFee = safeMoney2(Number(options.fee ?? 0));
  if (!Number.isFinite(safeFee) || safeFee <= 0) {
    throw new AppError("Valid delivery fee is required to accept delivery", 400);
  }
  const staffId = options.userId ? String(options.userId) : undefined;
  const note = options.note ? String(options.note).trim() : "";
  const nextPayload = {
    ...payload,
    deliveryFee: safeFee,
    deliveryQuote: {
      fee: safeFee,
      note,
      submittedAt: new Date().toISOString(),
      ...(staffId ? { branchStaffId: staffId } : {}),
    },
    delivery: {
      ...(payload.delivery || {}),
      type: "STORE",
      fee: safeFee,
      status: "Approved",
    },
    deliveryStatus: "processing",
  };
  await prisma.materialOrder.update({
    where: { id: orderId },
    data: { payload: nextPayload },
  });
  await syncJobStoreOrderDeliveryFromMaterialOrder(row, nextPayload);
  const enriched = enrichOrderFromDbRow(row, nextPayload);
  if (options.userId) {
    await appendSupplierOrderNote(
      orderId,
      options.userId,
      `Delivery accepted at R${safeFee.toFixed(2)}${note ? ` — ${note}` : ""}`,
      {
        branchScopeId: bScope || undefined,
        supplierOrgId: String(supplierId),
      }
    ).catch(() => null);
  }
  try {
    const notificationEvents = require("./notificationEvents.service");
    await notificationEvents.notifyDeliveryUpdate(
      row.userId,
      row.jobId || orderId,
      "Store delivery approved",
      `Your delivery fee is R${safeFee.toFixed(2)}. Pay delivery to proceed.`
    );
  } catch (e) {
    console.error("notifyStoreDeliveryApproved", e);
  }
  return enriched;
}

async function rejectMaterialOrderDeliveryBySupplier(orderId, supplierId, options = {}) {
  const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!row) throw new AppError("Material order not found", 404);
  await assertOrderOwnedBySupplierOrg(row, supplierId);
  const bScope = options.branchScopeId != null && String(options.branchScopeId).trim() !== "" ? String(options.branchScopeId).trim() : null;
  if (bScope && String(row.branchId || "") !== bScope) {
    throw new AppError("Forbidden", 403);
  }
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const dt = String(payload.deliveryType || "").toUpperCase();
  if (dt !== "STORE_DELIVERY") {
    throw new AppError("Only store delivery requests can be rejected here", 400);
  }
  const dStatus = normalizeDeliveryStatus(payload.delivery?.status);
  if (!storeDeliveryAwaitingBranchQuote(payload) && !["PendingApproval", "Quoted"].includes(dStatus)) {
    throw new AppError("Delivery cannot be rejected in current state", 400);
  }
  const reason = options.reason ? String(options.reason).trim() : "";
  const nextPayload = {
    ...payload,
    deliveryFee: 0,
    deliveryQuote: undefined,
    deliveryRejection: {
      reason,
      rejectedAt: new Date().toISOString(),
      ...(options.userId ? { branchStaffId: String(options.userId) } : {}),
    },
    delivery: {
      ...(payload.delivery || {}),
      fee: 0,
      status: "Rejected",
    },
    deliveryStatus: "processing",
  };
  delete nextPayload.deliveryQuote;
  await prisma.materialOrder.update({
    where: { id: orderId },
    data: { payload: nextPayload },
  });
  await syncJobStoreOrderDeliveryFromMaterialOrder(row, nextPayload);
  const enriched = enrichOrderFromDbRow(row, nextPayload);
  if (options.userId) {
    await appendSupplierOrderNote(
      orderId,
      options.userId,
      reason ? `Delivery request rejected — ${reason}` : "Delivery request rejected by branch",
      {
        branchScopeId: bScope || undefined,
        supplierOrgId: String(supplierId),
      }
    ).catch(() => null);
  }
  try {
    const notificationEvents = require("./notificationEvents.service");
    await notificationEvents.notifyDeliveryUpdate(
      row.userId,
      row.jobId || orderId,
      "Store delivery declined",
      reason || "Choose pickup or another delivery option"
    );
  } catch (e) {
    console.error("notifyStoreDeliveryRejected", e);
  }
  return enriched;
}

async function approveMaterialOrderDelivery(orderId) {
  return updateMaterialOrderDelivery(orderId, { status: "Approved" });
}

async function rejectMaterialOrderDelivery(orderId) {
  return updateMaterialOrderDelivery(orderId, { status: "Rejected" });
}

async function assertAssignedCourier(orderId, providerUserId) {
  const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!row) throw new AppError("Material order not found", 404);
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  if (String(payload.deliveryType || "").toUpperCase() !== "DELIVERY_PROVIDER") {
    throw new AppError("Not a courier delivery order", 400);
  }
  const assigned = resolveAssignedCourierId(payload);
  if (!assigned || assigned !== String(providerUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
  return { row, payload };
}

async function listDeliveryInboxForProvider(providerUserId) {
  const pid = String(providerUserId || "").trim();
  if (!pid) return [];
  const identityIds = new Set([pid]);
  const profile = await prisma.provider.findFirst({
    where: { OR: [{ userId: pid }, { id: pid }] },
    select: { id: true, userId: true },
  });
  if (profile?.id) identityIds.add(String(profile.id));
  if (profile?.userId) identityIds.add(String(profile.userId));

  const payloadOr = [];
  for (const id of identityIds) {
    payloadOr.push(
      { payload: { path: ["deliveryProviderId"], equals: id } },
      { payload: { path: ["delivery", "providerId"], equals: id } },
      { payload: { path: ["materialBatch", "assignedDriverId"], equals: id } }
    );
  }

  const include = {
    supplier: { select: { id: true, name: true, businessName: true } },
    branch: { select: { id: true, name: true, address: true, city: true, latitude: true, longitude: true } },
    job: { select: { id: true, title: true, location: true } },
  };

  let rows = await prisma.materialOrder.findMany({
    where: { OR: payloadOr },
    orderBy: { createdAt: "desc" },
    take: 100,
    include,
  });
  if (rows.length === 0) {
    rows = await prisma.materialOrder.findMany({
      where: { source: "job_materials" },
      orderBy: { createdAt: "desc" },
      take: 150,
      include,
    });
  }
  const filtered = [];
  for (const row of rows) {
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const dt = String(payload.deliveryType || "").toUpperCase();
    const delType = String(payload.delivery?.type || "").toUpperCase();
    const isProviderDelivery = dt === "DELIVERY_PROVIDER" || delType === "PROVIDER";
    if (!isProviderDelivery) continue;
    const assigned = resolveAssignedCourierId(payload);
    if (!assigned) continue;
    const resolvedAssigned = await resolveCourierUserId(assigned);
    if (resolvedAssigned === pid || assigned === pid) {
      filtered.push(row);
    }
  }
  return Promise.all(
    filtered.map(async (row) => {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      return enrichOrderFromDbRow(row, payload);
    })
  );
}

async function submitDeliveryQuote(orderId, providerUserId, { fee, note } = {}) {
  const safeFee = safeMoney2(Number(fee || 0));
  if (!Number.isFinite(safeFee)) {
    throw new AppError("Valid delivery fee is required", 400);
  }
  const { row, payload } = await assertAssignedCourier(orderId, providerUserId);
  const currentStatus = normalizeDeliveryStatus(payload.delivery?.status);
  if (!["PendingApproval", "Quoted"].includes(currentStatus)) {
    throw new AppError("Cannot quote in current delivery state", 400);
  }
  const nextPayload = {
    ...payload,
    deliveryFee: safeFee,
    deliveryQuote: {
      fee: safeFee,
      note: note ? String(note).trim() : "",
      submittedAt: new Date().toISOString(),
      providerId: String(providerUserId),
    },
    delivery: {
      ...(payload.delivery || {}),
      fee: safeFee,
      status: "Quoted",
    },
  };
  await prisma.materialOrder.update({
    where: { id: orderId },
    data: { payload: nextPayload },
  });
  const enriched = enrichOrderFromDbRow(row, nextPayload);
  try {
    const notificationEvents = require("./notificationEvents.service");
    await notificationEvents.notifyDeliveryQuoteSubmitted(row.userId, orderId, safeFee, row.jobId || undefined);
  } catch (e) {
    console.error("notifyDeliveryQuoteSubmitted", e);
  }
  return enriched;
}

async function rejectDeliveryRequestByProvider(orderId, providerUserId, reason) {
  const { row, payload } = await assertAssignedCourier(orderId, providerUserId);
  const currentStatus = normalizeDeliveryStatus(payload.delivery?.status);
  if (!["PendingApproval", "Quoted"].includes(currentStatus)) {
    throw new AppError("Cannot reject in current delivery state", 400);
  }
  const nextPayload = {
    ...payload,
    deliveryRejection: {
      reason: reason ? String(reason).trim() : "",
      rejectedAt: new Date().toISOString(),
      providerId: String(providerUserId),
    },
    delivery: {
      ...(payload.delivery || {}),
      status: "Rejected",
    },
  };
  await prisma.materialOrder.update({
    where: { id: orderId },
    data: { payload: nextPayload },
  });
  const enriched = enrichOrderFromDbRow(row, nextPayload);
  try {
    const notificationEvents = require("./notificationEvents.service");
    await notificationEvents.notifyDeliveryUpdate(
      row.userId,
      row.jobId || orderId,
      "Your delivery request",
      "Courier declined — choose another provider"
    );
  } catch (e) {
    console.error("notifyDeliveryRejected", e);
  }
  return enriched;
}

async function acceptDeliveryQuote(orderId, customerUserId) {
  const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
  if (!row) throw new AppError("Material order not found", 404);
  if (String(row.userId) !== String(customerUserId)) {
    throw new AppError("Forbidden", 403);
  }
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const currentStatus = normalizeDeliveryStatus(payload.delivery?.status);
  if (currentStatus !== "Quoted") {
    throw new AppError("No quoted delivery fee to accept", 400);
  }
  const quotedFee = Number(payload.deliveryQuote?.fee ?? payload.deliveryFee ?? payload.delivery?.fee ?? 0);
  const nextPayload = {
    ...payload,
    deliveryFee: quotedFee,
    delivery: {
      ...(payload.delivery || {}),
      fee: quotedFee,
      status: "Approved",
    },
  };
  await prisma.materialOrder.update({
    where: { id: orderId },
    data: { payload: nextPayload },
  });
  return enrichOrderFromDbRow(row, nextPayload);
}

async function notifyAssignedCourier(orderId, courierUserId) {
  if (!courierUserId) return;
  try {
    const notificationEvents = require("./notificationEvents.service");
    await notificationEvents.notifyCourierDeliveryRequest(String(courierUserId), String(orderId));
  } catch (e) {
    console.error("notifyAssignedCourier", e);
  }
}

async function markMaterialOrderDeliveryPaid(orderId, paymentExtras = {}) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.materialOrder.findUnique({ where: { id: orderId } });
      if (!row || !row.payload || typeof row.payload !== "object") {
        throw new AppError("Material order not found", 404);
      }
      const current = row.payload;
      if (current.payment?.deliveryPaid === true) {
        return enrichOrderFromDbRow(row, current);
      }
      const fulfillmentCompleted = String(row.fulfillmentStatus || "").toUpperCase() === "COMPLETED";
      if (fulfillmentCompleted) {
        if (paymentExtras.reconcileFromDeliveryRequest) {
          const updated = {
            ...current,
            payment: {
              ...(current.payment || {}),
              materialsPaid: Boolean(current.payment?.materialsPaid),
              deliveryPaid: true,
              ...(paymentExtras.paidAt ? { paidAt: paymentExtras.paidAt } : {}),
            },
          };
          await tx.materialOrder.update({
            where: { id: orderId },
            data: { payload: updated },
          });
          return enrichOrderFromDbRow(row, updated);
        }
        throw new AppError("Cannot attach payment to completed order", 400);
      }
      const deliveryType = String(current.deliveryType || "").toUpperCase();
      let deliveryStatus = normalizeDeliveryStatus(current.delivery?.status);
      if (deliveryType === "DELIVERY_PROVIDER" && !["Approved", "Processing"].includes(deliveryStatus)) {
        const dr = await tx.deliveryRequest.findFirst({ where: { materialOrderId: String(orderId) } });
        const drStatus = dr ? String(dr.status || "").toLowerCase() : "";
        const drPaid = isDeliveryRequestPaid(dr);
        if (paymentExtras.reconcileFromDeliveryRequest || drPaid || drStatus === "approved") {
          deliveryStatus = drPaid ? "Processing" : "Approved";
        } else {
          throw new AppError("Delivery fee must be approved before payment", 400);
        }
      }
      const safeFee = safeMoney2(Number(paymentExtras.fee ?? current.deliveryFee ?? 0));
      const paidAt = paymentExtras.paidAt || new Date().toISOString();
      const updated = {
        ...current,
        deliveryFee: safeFee,
        deliveryStatus: "processing",
        payment: {
          ...(current.payment || {}),
          materialsPaid: Boolean(current.payment?.materialsPaid),
          deliveryPaid: true,
          ...(paymentExtras.merchantReference ? { merchantReference: String(paymentExtras.merchantReference) } : {}),
          ...(paymentExtras.provider ? { provider: String(paymentExtras.provider) } : {}),
          ...(paymentExtras.gatewayTransactionId
            ? { gatewayTransactionId: String(paymentExtras.gatewayTransactionId) }
            : {}),
          paidAt,
        },
        delivery: { ...(current.delivery || {}), fee: safeFee, status: "Processing" },
        deliveryInvoiceId:
          paymentExtras.invoiceId || current.deliveryInvoiceId || `INV-DEL-${Date.now()}`,
      };
      const fulfillmentStatus = (() => {
        const current = String(row.fulfillmentStatus || "PENDING").toUpperCase();
        const postDispatch = ["OUT_FOR_DELIVERY", "COMPLETED"];
        if (deliveryType === "DELIVERY_PROVIDER" || deliveryType === "STORE_DELIVERY") {
          if (postDispatch.includes(current)) return current;
          return "READY";
        }
        return row.fulfillmentStatus || "PENDING";
      })();
      const dbData = { payload: updated, fulfillmentStatus };
      if (deliveryType === "STORE_DELIVERY") {
        const materialsSubtotal = Number(row.materialsSubtotal ?? current.materialsSubtotal ?? 0);
        const { platformCommission, supplierEarning } = supplierService.splitStoreDeliveryCommission(
          materialsSubtotal,
          safeFee
        );
        dbData.platformCommission = new Prisma.Decimal(platformCommission);
        dbData.supplierEarning = new Prisma.Decimal(supplierEarning);
        updated.platformCommission = platformCommission;
        updated.supplierEarning = supplierEarning;
      }
      await tx.materialOrder.update({
        where: { id: orderId },
        data: dbData,
      });
      return enrichOrderFromDbRow({ ...row, fulfillmentStatus, ...dbData }, updated);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
  ).then(async (enriched) => {
    try {
      const dr = await prisma.deliveryRequest.findFirst({ where: { materialOrderId: String(orderId) } });
      if (dr && String(dr.status) === "approved") {
        const deliveryRequestService = require("./deliveryRequest.service");
        await deliveryRequestService.settleDeliveryRequestPayment(dr.id, {
          amount: enriched.deliveryFee,
          merchantReference: paymentExtras.merchantReference,
          provider: paymentExtras.provider,
          gatewayTransactionId: paymentExtras.gatewayTransactionId,
          paidAt: paymentExtras.paidAt,
          id: paymentExtras.merchantReference || orderId,
        });
      }
    } catch (e) {
      console.error("markMaterialOrderDeliveryPaid sync delivery request", orderId, e);
    }
    try {
      const row = await prisma.materialOrder.findUnique({ where: { id: orderId } });
      if (row?.payload) {
        await syncJobStoreOrderDeliveryFromMaterialOrder(row, enriched);
      }
    } catch (e) {
      console.error("markMaterialOrderDeliveryPaid sync job store order", orderId, e);
    }
    return enriched;
  });
}

async function payMaterialOrderDelivery(orderId, cardLast4, fee) {
  console.log(
    JSON.stringify({
      ns: "material_order",
      event: "delivery_payment_attach",
      orderId: String(orderId),
      at: new Date().toISOString(),
    })
  );
  return markMaterialOrderDeliveryPaid(orderId, {
    fee,
    invoiceId: `INV-DEL-${Date.now()}`,
  });
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

  try {
    const escrowSettlement = require("./payments/escrowSettlement.service");
    const partial = outcome.refundAmount > 0 && outcome.refundAmount < Number(row.materialsSubtotal || 0);
    await escrowSettlement.markMaterialIntentRefunded(orderId, partial);
    const intent = await tx.paymentIntent.findFirst({
      where: { materialOrderId: orderId, state: "PAID" },
    });
    if (intent && outcome.refundAmount > 0) {
      const refundService = require("./payments/refund.service");
      await refundService.requestGatewayRefund(intent.id, outcome.refundAmount);
    }
  } catch (e) {
    console.error("material refund gateway", e);
  }

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
      const currentStatus = row.fulfillmentStatus || "PENDING";
      if (!canFulfillmentTransition(currentStatus, next)) {
        throw new AppError(`Cannot transition from ${currentStatus} to ${next}`, 400);
      }
      let payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
      if (next === "OUT_FOR_DELIVERY" || next === "COMPLETED") {
        assertStoreDeliveryPaidBeforeDispatch(payload);
      }
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
      const assignedCourierId = resolveAssignedCourierId(payloadPreview);
      if (!assignedCourierId || assignedCourierId !== pid) {
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

/** When courier completes via DeliveryRequest, sync linked material order fulfillment. */
async function syncMaterialOrderFulfillmentFromDeliveryRequest(deliveryRequestRow) {
  const moId = deliveryRequestRow?.materialOrderId
    ? String(deliveryRequestRow.materialOrderId).trim()
    : "";
  if (!moId) return;
  const row = await prisma.materialOrder.findUnique({ where: { id: moId } });
  if (!row) return;
  const fs = String(row.fulfillmentStatus || "").toUpperCase();
  if (fs === "COMPLETED") return;

  const ts = new Date().toISOString();
  let payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload = patchPayloadForFulfillmentDelivery(payload, "COMPLETED");
  payload.materialBatch = mergeMaterialBatch(payload, { ...row, fulfillmentStatus: "COMPLETED" }, {
    status: "delivered",
    timestamps: { deliveredAt: ts },
  });
  if (isDeliveryRequestPaid(deliveryRequestRow)) {
    payload.payment = {
      ...(payload.payment || {}),
      materialsPaid: payload.payment?.materialsPaid !== false,
      deliveryPaid: true,
    };
  }

  await prisma.materialOrder.update({
    where: { id: moId },
    data: { fulfillmentStatus: "COMPLETED", payload },
  });

  try {
    await notifyCustomerFulfillmentStep({ ...row, userId: row.userId, jobId: row.jobId }, "COMPLETED");
    emitMaterialOrderFulfillmentToCustomer(row.userId, {
      orderId: moId,
      jobId: row.jobId || null,
      fulfillmentStatus: "COMPLETED",
      materialBatch: payload.materialBatch,
    });
  } catch (e) {
    console.error("syncMaterialOrderFulfillmentFromDeliveryRequest notify", e);
  }
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
      const payloadCheck =
        row.payload && typeof row.payload === "object" ? row.payload : {};
      if (
        payloadCheck.customerDeliveryIssue &&
        typeof payloadCheck.customerDeliveryIssue === "object" &&
        String(payloadCheck.customerDeliveryIssue.status || "") === "open"
      ) {
        throw new AppError(
          "You reported a delivery issue — the branch will follow up before you can confirm receipt",
          400
        );
      }
      const fs = String(row.fulfillmentStatus || "").toUpperCase();
      const pickup = orderIsPickupFromRow(row);

      if (fs === "COMPLETED") {
        const payload = {
          ...row.payload,
          deliveryConfirmed: true,
          deliveryConfirmedAt: new Date().toISOString(),
        };
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
        payload.deliveryConfirmedAt = ts;
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

  if (trxResult.mode === "receipt_ack") {
    try {
      const existingRating = await prisma.materialOrderRating.findUnique({ where: { orderId: oid } });
      if (existingRating) {
        const deliveryRequestService = require("./deliveryRequest.service");
        await deliveryRequestService.syncCourierDeliveryCustomerCompletion(oid);
      }
    } catch (e) {
      console.error("confirmDeliveryReceipt sync courier completion", e);
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

const DELIVERY_ISSUE_REASONS = new Set([
  "items_missing",
  "items_broken",
  "wrong_items",
  "not_received",
  "other",
]);

function deliveryIssueReasonLabel(reason) {
  const map = {
    items_missing: "Items missing",
    items_broken: "Items broken or damaged",
    wrong_items: "Wrong items delivered",
    not_received: "Delivery not received",
    other: "Other",
  };
  return map[String(reason || "")] || String(reason || "Issue reported");
}

async function reportDeliveryIssue(orderId, customerUserId, { reason, details } = {}) {
  const oid = String(orderId || "").trim();
  const reasonKey = String(reason || "").trim();
  if (!DELIVERY_ISSUE_REASONS.has(reasonKey)) {
    throw new AppError("Invalid issue reason", 400);
  }
  const detailsText = details != null ? String(details).trim() : "";
  if (reasonKey === "other" && !detailsText) {
    throw new AppError("Please describe the issue when selecting Other", 400);
  }

  const row = await prisma.materialOrder.findUnique({ where: { id: oid } });
  if (!row || !row.payload || typeof row.payload !== "object") {
    throw new AppError("Material order not found", 404);
  }
  if (String(row.userId) !== String(customerUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
  const fs = String(row.fulfillmentStatus || "").toUpperCase();
  if (fs !== "COMPLETED") {
    throw new AppError("Delivery is not ready to report an issue yet", 400);
  }

  const payload = { ...row.payload };
  if (payload.deliveryConfirmed === true) {
    throw new AppError("Delivery already confirmed — cannot report an issue", 400);
  }
  const existing = payload.customerDeliveryIssue;
  if (existing && typeof existing === "object" && String(existing.status || "") === "open") {
    throw new AppError("An issue has already been reported for this order", 400);
  }

  const reportedAt = new Date().toISOString();
  const issue = {
    reason: reasonKey,
    details: detailsText || undefined,
    reportedAt,
    status: "open",
  };
  const activity = Array.isArray(payload.supplierActivity) ? [...payload.supplierActivity] : [];
  activity.push({
    type: "customer_delivery_issue",
    reason: reasonKey,
    details: detailsText || null,
    createdAt: reportedAt,
  });

  const nextPayload = {
    ...payload,
    customerDeliveryIssue: issue,
    customerIssueFlag: true,
    supplierActivity: activity,
  };

  await prisma.materialOrder.update({
    where: { id: oid },
    data: { payload: nextPayload },
  });

  const shortId = `Order #${oid.slice(0, 8)}`;
  const reasonLabel = deliveryIssueReasonLabel(reasonKey);
  const branchId = String(row.branchId || "").trim();

  try {
    if (branchId) {
      void branchStaffNotificationService.createForBranchUsers(branchId, {
        category: "ORDERS",
        type: "material_order_customer_issue",
        title: "Customer reported a delivery issue",
        message: `${shortId} — ${reasonLabel}. Open the order to review.`,
        materialOrderId: oid,
        metadata: { reason: reasonKey, details: detailsText || null, reportedAt },
      });
      if (global.io) {
        global.io.to(`branch:${branchId}`).emit("supplier:material_order:customer_issue", {
          orderId: oid,
          branchId,
          reason: reasonKey,
          details: detailsText || null,
          reportedAt,
        });
      }
    }
  } catch (e) {
    console.error("reportDeliveryIssue notify", e);
  }

  await logAudit(AUDIT_ACTIONS.MATERIAL_ORDER_DELIVERY_ISSUE, {
    userId: customerUserId,
    entityType: ENTITY_TYPES.PAYMENT,
    entityId: oid,
    newValue: { reason: reasonKey },
  });

  return enrichOrderFromDbRow({ ...row, payload: nextPayload }, nextPayload);
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
      branch: { select: { id: true, name: true, deliveryFee: true, hasDelivery: true } },
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
  const courierIds = [
    ...new Set(
      rows
        .map((r) => {
          const payload = r.payload && typeof r.payload === "object" ? r.payload : {};
          return resolveAssignedCourierId(payload);
        })
        .filter(Boolean)
    ),
  ];
  const couriers =
    courierIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: courierIds } },
          select: { id: true, name: true, email: true, phone: true },
        })
      : [];
  const courierMap = new Map(couriers.map((c) => [c.id, c]));
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
    const courierId = resolveAssignedCourierId(payload);
    const courier = courierId ? courierMap.get(courierId) : undefined;
    const branchDeliveryFee = Number(r.branch?.deliveryFee ?? 0);
    return {
      ...base,
      id: r.id,
      branchId: r.branchId,
      branchName: r.branch?.name ? String(r.branch.name) : undefined,
      branchDeliveryFee: Number.isFinite(branchDeliveryFee) ? branchDeliveryFee : 0,
      branchHasDelivery: Boolean(r.branch?.hasDelivery),
      customerId: r.userId,
      customerName: u?.name,
      customerEmail: u?.email,
      customerPhone: u?.phone,
      customerLocation,
      customerAddress,
      deliveryProviderName: courier?.name ? String(courier.name) : undefined,
      deliveryProviderPhone: courier?.phone ? String(courier.phone) : undefined,
      deliveryProviderEmail: courier?.email ? String(courier.email) : undefined,
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
  await logAudit(AUDIT_ACTIONS.MATERIAL_ORDER_CANCEL_SUPPLIER, {
    userId: supplierUserId,
    entityType: ENTITY_TYPES.PAYMENT,
    entityId: String(orderId),
    newValue: {
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
  await logAudit(AUDIT_ACTIONS.MATERIAL_ORDER_CANCEL_CUSTOMER, {
    userId: customerUserId,
    entityType: ENTITY_TYPES.PAYMENT,
    entityId: String(orderId),
    newValue: {
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
 * When customer picks a courier before paying job materials: ensure a MaterialOrder row exists
 * (unpaid) so the courier inbox + notification fire immediately.
 */
async function syncJobStoreCourierDeliveryRequest(params) {
  const {
    jobId,
    jobStoreOrderId,
    supplierBranchId,
    customerUserId,
    jobProviderUserId,
    courierUserId,
    materialsLines = [],
    jobSiteAddress = "",
    jobSiteLocation = null,
    storeOrderBranchId = null,
  } = params;
  const sid = String(supplierBranchId || "").trim();
  let storeOrderId = String(jobStoreOrderId || "").trim();
  const courierId = await resolveCourierUserId(courierUserId);
  if (!jobId || !sid || !customerUserId || !storeOrderId || !courierId) {
    throw new AppError("Missing data to assign a delivery provider", 400);
  }

  const patchCourierOntoPayload = (payload) => {
    const next = payload && typeof payload === "object" ? { ...payload } : {};
    next.deliveryType = "DELIVERY_PROVIDER";
    next.deliveryProviderId = courierId;
    next.delivery = {
      ...(next.delivery || {}),
      type: "PROVIDER",
      status: "PendingApproval",
      providerId: courierId,
      fee: coerceNumber(next.delivery?.fee, 0),
    };
    const prevBatch =
      next.materialBatch && typeof next.materialBatch === "object" ? { ...next.materialBatch } : {};
    next.materialBatch = {
      ...prevBatch,
      id: prevBatch.id || next.id || next.jobStoreOrderId || undefined,
      deliveryType: deliveryJobTypeToCanonical("PROVIDER"),
      assignedDriverId: courierId,
    };
    return next;
  };

  let existing = await prisma.materialOrder.findUnique({ where: { id: storeOrderId } });
  if (!existing && jobId && (storeOrderBranchId || sid)) {
    existing = await prisma.materialOrder.findFirst({
      where: {
        jobId: String(jobId),
        branchId: String(storeOrderBranchId || sid),
        source: "job_materials",
        fulfillmentStatus: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      storeOrderId = String(existing.id);
    }
  }
  if (existing) {
    const basePayload =
      existing.payload && typeof existing.payload === "object" ? { ...existing.payload } : {};
    let payload = patchCourierOntoPayload(basePayload);
    const geo = await resolveCourierDeliveryGeoPoints({
      storeOrderBranchId: storeOrderBranchId || existing.branchId,
      supplierBranchId: sid,
      materialsLines: Array.isArray(basePayload.items) ? basePayload.items : [],
      jobProviderUserId,
      jobSiteAddress,
      jobSiteLocation,
    });
    if (geo) {
      payload = applyCourierGeoPointsToPayload(payload, geo);
    }
    payload.materialBatch = mergeMaterialBatch(
      payload,
      {
        id: storeOrderId,
        branchId: existing.branchId,
        supplierId: existing.supplierId,
        fulfillmentStatus: existing.fulfillmentStatus,
      },
      { status: "pending" }
    );
    payload.materialBatch.assignedDriverId = courierId;
    payload.materialBatch.deliveryType = deliveryJobTypeToCanonical("PROVIDER");
    const prevCourier = resolveAssignedCourierId(basePayload);
    const prevResolved = prevCourier ? await resolveCourierUserId(prevCourier) : "";
    await prisma.materialOrder.update({
      where: { id: storeOrderId },
      data: { payload },
    });
    if (prevResolved !== courierId) {
      await notifyAssignedCourier(storeOrderId, courierId);
    }
    return storeOrderId;
  }

  const lines = Array.isArray(materialsLines) ? materialsLines : [];
  if (lines.length === 0) {
    throw new AppError("No material lines found for this store order", 400);
  }

  const materialsTotal = lines.reduce((sum, m) => sum + coerceAmt(m.qty) * coerceAmt(m.unitPrice), 0);
  const items = lines.map((m) => ({
    supplierId: String(m.supplierId || sid),
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

  const geo = await resolveCourierDeliveryGeoPoints({
    storeOrderBranchId: storeOrderBranchId || sid,
    supplierBranchId: sid,
    materialsLines: lines,
    jobProviderUserId,
    jobSiteAddress,
    jobSiteLocation,
  });
  if (!geo?.branch) {
    throw new AppError(
      "Could not resolve a pickup branch for this material order. Link materials to a store branch or contact support.",
      400
    );
  }
  const { branch, pickupAddr, collectionPointLabel, collectionPoint, destinationPoint } = geo;
  const orgId = branch.supplierId;

  const { prismaRow, order } = normalizeOrder({
    id: storeOrderId,
    userId: String(customerUserId),
    storeId: sid,
    storeName: lines[0]?.supplierName || "Store",
    items,
    materialsTotal,
    delivery: { type: "PROVIDER", fee: 0, providerId: courierId, status: "PendingApproval" },
    jobId: String(jobId),
    providerId: jobProviderUserId ? String(jobProviderUserId) : null,
    paymentStatus: "unpaid",
    source: "job_materials",
  });

  let finalPayload = patchCourierOntoPayload({
    ...order,
    storeName: branchService.branchPublicDisplay(branch, branch.supplier) || lines[0]?.supplierName || order.storeName,
    jobStoreOrderId: storeOrderId,
  });
  finalPayload.materialBatch = mergeMaterialBatch(
    finalPayload,
    { id: prismaRow.id, branchId: branch.id, supplierId: orgId, fulfillmentStatus: "PENDING" },
    { status: "pending" }
  );
  finalPayload.materialBatch.pickupAddress = pickupAddr;
  finalPayload.materialBatch.deliveryAddress = String(jobSiteAddress || "");
  finalPayload.collectionPoint = collectionPoint;
  finalPayload.destinationPoint = destinationPoint;
  finalPayload.payment = { materialsPaid: false, deliveryPaid: false };

  await prisma.materialOrder.create({
    data: {
      id: prismaRow.id,
      userId: prismaRow.userId,
      supplierId: orgId,
      branchId: branch.id,
      jobId: prismaRow.jobId,
      providerId: prismaRow.providerId,
      paymentStatus: "unpaid",
      source: prismaRow.source,
      fulfillmentStatus: prismaRow.fulfillmentStatus,
      materialsSubtotal: prismaRow.materialsSubtotal,
      platformCommission: prismaRow.platformCommission,
      supplierEarning: prismaRow.supplierEarning,
      payload: finalPayload,
    },
  });

  await notifyAssignedCourier(prismaRow.id, courierId);
  return prismaRow.id;
}

/**
 * After customer pays job materials for a store: persist MaterialOrder for supplier dashboard & fulfillment.
 * Always uses job meta `storeOrders[].orderId` as the MaterialOrder primary key (one independent row per batch).
 * Idempotent when the same store order id is paid again while the row is not yet completed.
 */
function linesFromOrderForGeo(payload, params = {}) {
  if (Array.isArray(payload?.items) && payload.items.length > 0) return payload.items;
  if (Array.isArray(params.materialsLines) && params.materialsLines.length > 0) {
    return params.materialsLines;
  }
  return [];
}

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
    jobSiteLocation = null,
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
    const existingPayload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
    const jd = String(jobDeliveryType || "SELF").toUpperCase();
    const apiDel = jd === "STORE" ? "STORE" : jd === "PROVIDER" || jd === "DELIVERY_PROVIDER" ? "PROVIDER" : "SELF";
    let resolvedCourierForPay = "";
    if (paramDeliveryProviderId && apiDel === "PROVIDER") {
      resolvedCourierForPay = await resolveCourierUserId(paramDeliveryProviderId);
      existingPayload.deliveryType = "DELIVERY_PROVIDER";
      existingPayload.deliveryProviderId = resolvedCourierForPay;
      existingPayload.delivery = {
        ...(existingPayload.delivery || {}),
        type: "PROVIDER",
        status: "PendingApproval",
        providerId: resolvedCourierForPay,
        fee: coerceNumber(existingPayload.delivery?.fee, 0),
      };
      existingPayload.materialBatch = mergeMaterialBatch(
        existingPayload,
        {
          id: storeOrderId,
          branchId: row.branchId,
          supplierId: row.supplierId,
          fulfillmentStatus: row.fulfillmentStatus,
        },
        { status: "pending" }
      );
      existingPayload.materialBatch.assignedDriverId = resolvedCourierForPay;
      existingPayload.materialBatch.deliveryType = deliveryJobTypeToCanonical("PROVIDER");
    }
    const needsPaid = String(row.paymentStatus || "").toLowerCase() !== "paid";
    if (needsPaid) {
      existingPayload.payment = { ...(existingPayload.payment || {}), materialsPaid: true, deliveryPaid: false };
      existingPayload.paymentStatus = "paid";
      await prisma.materialOrder.update({
        where: { id: storeOrderId },
        data: { paymentStatus: "paid", payload: existingPayload },
      });
      if (apiDel === "PROVIDER" && resolvedCourierForPay) {
        await notifyAssignedCourier(storeOrderId, resolvedCourierForPay);
      }
    } else if (paramDeliveryProviderId && apiDel === "PROVIDER") {
      await prisma.materialOrder.update({
        where: { id: storeOrderId },
        data: { payload: existingPayload },
      });
    }
    console.log(
      JSON.stringify({
        ns: "material_order",
        event: "ensure_job_material_order_idempotent",
        materialOrderId: row.id,
        jobId: String(jobId),
        storeOrderId,
        markedPaid: needsPaid,
        at: new Date().toISOString(),
      })
    );
    if (apiDel === "PROVIDER") {
      try {
        const geo = await resolveCourierDeliveryGeoPoints({
          storeOrderBranchId: row.branchId || sid,
          supplierBranchId: sid,
          materialsLines: linesFromOrderForGeo(existingPayload, params),
          jobSiteAddress: String(jobSiteAddress || ""),
          jobSiteLocation: jobSiteLocation || null,
        });
        if (geo) {
          const geoPayload = applyCourierGeoPointsToPayload(existingPayload, geo);
          await prisma.materialOrder.update({
            where: { id: storeOrderId },
            data: { payload: geoPayload },
          });
          const dr = await prisma.deliveryRequest.findFirst({
            where: { materialOrderId: storeOrderId },
          });
          if (dr) {
            await prisma.deliveryRequest.update({
              where: { id: dr.id },
              data: {
                collectionPoint: geo.collectionPoint,
                destinationPoint: geo.destinationPoint,
              },
            });
            if (dr.jobId) {
              const dest = geo.destinationPoint;
              const coll = geo.collectionPoint;
              await prisma.job.update({
                where: { id: dr.jobId },
                data: {
                  location: dest.city || dest.address || "UNKNOWN",
                  locationDetails: {
                    address: dest.address,
                    city: dest.city,
                    area: dest.area,
                    suburb: dest.suburb,
                    coordinates: dest.coordinates,
                    collection: coll,
                    destination: dest,
                  },
                  measurements: {
                    source: "MANUAL",
                    values: {},
                    collectionPoint: coll,
                    destinationPoint: dest,
                  },
                },
              });
            }
          }
        }
      } catch (e) {
        console.error("ensureJobMaterialPurchaseOrder geo refresh", e);
        if (e instanceof AppError) throw e;
      }
    }
    const refreshed = await prisma.materialOrder.findUnique({ where: { id: storeOrderId } });
    return enrichOrderFromDbRow(
      refreshed || row,
      refreshed?.payload && typeof refreshed.payload === "object" ? refreshed.payload : existingPayload
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

  const branch = await resolveBranchForCourierDelivery(sid, lines);
  if (!branch) {
    throw new AppError("Branch not found for material pickup", 400);
  }
  const orgId = branch.supplierId;
  const pickupAddr = branch.address ? String(branch.address) : "";

  const jd = String(jobDeliveryType || "SELF").toUpperCase();
  const apiDel = jd === "STORE" ? "STORE" : jd === "PROVIDER" || jd === "DELIVERY_PROVIDER" ? "PROVIDER" : "SELF";
  const resolvedCourierForCreate =
    paramDeliveryProviderId && apiDel === "PROVIDER"
      ? await resolveCourierUserId(paramDeliveryProviderId)
      : undefined;

  const { prismaRow, order } = normalizeOrder({
    id: storeOrderId || undefined,
    userId: String(customerUserId),
    storeId: sid,
    storeName: lines[0]?.supplierName || "Store",
    items,
    materialsTotal,
    delivery: { type: apiDel, fee: 0, providerId: resolvedCourierForCreate, status: defaultDeliveryStatusForType({ type: apiDel, fee: 0 }) },
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
    { id: prismaRow.id, branchId: branch.id, supplierId: orgId, fulfillmentStatus: "PENDING" },
    {
      status: "pending",
    }
  );
  finalPayload.materialBatch.pickupAddress = pickupAddr;
  finalPayload.materialBatch.deliveryAddress = String(jobSiteAddress || "");
  finalPayload.materialBatch.deliveryType = deliveryJobTypeToCanonical(apiDel);
  if (resolvedCourierForCreate) {
    finalPayload.materialBatch.assignedDriverId = resolvedCourierForCreate;
  }
  finalPayload.collectionPoint = buildGeoPoint({
    address: pickupAddr,
    city: branch.city || branch.supplier?.city,
    area: branch.area,
    coordinates:
      branch.latitude != null && branch.longitude != null
        ? { lat: Number(branch.latitude), lng: Number(branch.longitude) }
        : undefined,
    label: branchService.branchPublicDisplay(branch, branch.supplier) || "Collection point",
  });
  finalPayload.destinationPoint = buildGeoPoint({
    address: String(jobSiteLocation?.address || jobSiteAddress || ""),
    city: jobSiteLocation?.city,
    area: jobSiteLocation?.area,
    suburb: jobSiteLocation?.suburb,
    coordinates: jobSiteLocation?.coordinates,
    label: "Delivery destination",
  });
  if (apiDel === "STORE") {
    finalPayload.deliveryType = "STORE_DELIVERY";
    finalPayload.deliveryFee = 0;
    finalPayload.delivery = {
      ...(finalPayload.delivery || {}),
      type: "STORE",
      status: "PendingApproval",
      fee: 0,
    };
  }
  if (apiDel === "PROVIDER" && resolvedCourierForCreate) {
    finalPayload.deliveryType = "DELIVERY_PROVIDER";
    finalPayload.deliveryProviderId = resolvedCourierForCreate;
    finalPayload.delivery = {
      ...(finalPayload.delivery || {}),
      type: "PROVIDER",
      status: "PendingApproval",
      providerId: resolvedCourierForCreate,
      fee: 0,
    };
  }

  await prisma.materialOrder.create({
    data: {
      id: prismaRow.id,
      userId: prismaRow.userId,
      supplierId: orgId,
      branchId: branch.id,
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
      branchId: branch.id,
      supplierOrgId: orgId,
      storeOrderId,
      at: new Date().toISOString(),
    })
  );

  await emitSupplierMaterialOrderCreated(orgId, prismaRow.id, branch.id, prismaRow.jobId);
  if (apiDel === "PROVIDER" && resolvedCourierForCreate) {
    await notifyAssignedCourier(prismaRow.id, resolvedCourierForCreate);
  }
  return finalPayload;
}

async function getJobMaterialOrdersForJob(jobId) {
  const rows = await prisma.materialOrder.findMany({
    where: { jobId: String(jobId) },
    orderBy: { createdAt: "desc" },
    include: { supplier: { select: { id: true, name: true, businessName: true } } },
  });
  for (const r of rows) {
    const payload = r.payload && typeof r.payload === "object" ? r.payload : {};
    if (payload.jobStoreOrderId) {
      await syncJobStoreOrderDeliveryFromMaterialOrder(r, payload).catch(() => null);
    }
  }
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
      refundStatus: r.refundStatus != null ? String(r.refundStatus) : undefined,
      refundAmount: r.refundAmount != null ? Number(r.refundAmount) : undefined,
      refundProcessedAt:
        r.refundProcessedAt instanceof Date
          ? r.refundProcessedAt.toISOString()
          : r.refundProcessedAt != null
            ? String(r.refundProcessedAt)
            : undefined,
      cancelledBy: r.cancelledBy != null ? String(r.cancelledBy) : undefined,
      cancellationReason: r.cancellationReason != null ? String(r.cancellationReason) : undefined,
      cancelledAt:
        r.cancelledAt instanceof Date ? r.cancelledAt.toISOString() : r.cancelledAt != null ? String(r.cancelledAt) : undefined,
      items: items.map((i) => ({
        name: i.name,
        quantity: Number(i.quantity ?? i.qty ?? 0),
        price: Number(i.price ?? i.unitPrice ?? 0),
        productId: i.productId,
      })),
      deliveryType: payload.deliveryType ? String(payload.deliveryType) : undefined,
      deliveryFee: Number(payload.deliveryFee ?? payload.delivery?.fee ?? 0),
      deliveryQuote: payload.deliveryQuote,
      delivery: payload.delivery,
      deliveryStatus: payload.delivery?.status,
      payment: payload.payment,
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

/** Order total for supplier export rows (enriched payload from listMaterialOrdersBySupplier). */
function orderTotalForExport(order) {
  const fromTotal = Number(order.total);
  if (Number.isFinite(fromTotal) && fromTotal >= 0) return roundMoney2(fromTotal);
  const mat = Number(order.materialsSubtotal ?? 0);
  const delivery = order.delivery && typeof order.delivery === "object" ? order.delivery : {};
  const fee = Number(order.deliveryFee ?? delivery.fee ?? 0);
  return roundMoney2(Math.max(0, mat + fee));
}

/**
 * Aggregates paid material orders (platform-wide or per supplier).
 * Commission = 7% of each order's total (see orderTotalFromRow).
 */
async function aggregatePaidMaterialOrders({ supplierId } = {}) {
  const where = {
    paymentStatus: "paid",
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

/**
 * @deprecated Use aggregatePaidMaterialOrders — kept as alias for callers expecting the old name.
 */
async function aggregateCompletedPaidMaterialOrders(opts = {}) {
  return aggregatePaidMaterialOrders(opts);
}

/**
 * Per-supplier breakdown of paid material orders (for admin list filter-aware cards).
 */
async function aggregatePaidMaterialOrdersBySupplier() {
  const rows = await prisma.materialOrder.findMany({
    where: {
      paymentStatus: "paid",
    },
    select: {
      supplierId: true,
      materialsSubtotal: true,
      payload: true,
      platformCommission: true,
    },
  });

  const bySupplier = new Map();
  for (const row of rows) {
    const supplierId = String(row.supplierId || "").trim();
    if (!supplierId) continue;
    const entry = bySupplier.get(supplierId) || {
      orderCount: 0,
      totalRevenue: 0,
      totalCommission: 0,
    };
    entry.orderCount += 1;
    entry.totalRevenue += orderTotalFromRow(row);
    entry.totalCommission += Number(row.platformCommission || 0);
    bySupplier.set(supplierId, entry);
  }

  const result = new Map();
  for (const [supplierId, entry] of bySupplier) {
    const orderCount = entry.orderCount;
    const totalRevenue = roundMoney2(entry.totalRevenue);
    const totalCommission = roundMoney2(entry.totalCommission);
    result.set(supplierId, {
      orderCount,
      totalRevenue,
      totalCommission,
      averageOrderValue: orderCount > 0 ? roundMoney2(totalRevenue / orderCount) : 0,
      commissionRate: ADMIN_ANALYTICS_COMMISSION_RATE,
    });
  }
  return result;
}

/** @deprecated Alias for aggregatePaidMaterialOrdersBySupplier */
async function aggregateCompletedPaidMaterialOrdersBySupplier() {
  return aggregatePaidMaterialOrdersBySupplier();
}

function computeSupplierExportFinancials(order) {
  const status = String(order.fulfillmentStatus || "").toUpperCase();
  const finance = supplierService.buildOrderFinanceBreakdown(order);
  const totalAmount = finance.orderGross;
  const commission = finance.platformCommission;
  const netEarnings = finance.supplierNet;
  const cancelled = status === "CANCELLED";
  const cancelledBy = String(order.cancelledBy || "").toLowerCase();
  const completedPaid = status === "COMPLETED" && String(order.paymentStatus || "").toLowerCase() === "paid";

  if (cancelled) {
    return {
      totalAmount,
      commission,
      netEarnings,
      completedPaid: false,
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
      completedPaid: false,
      revenueImpact: 0,
      commissionImpact: 0,
      netImpact: 0,
    };
  }
  return {
    totalAmount,
    commission,
    netEarnings,
    completedPaid: true,
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
      isCompletedPaid: fx.completedPaid,
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
      if (row.isCancelled) {
        acc.cancelledCount += 1;
        acc.cancelledRevenueAdjustment = roundMoney2(acc.cancelledRevenueAdjustment + row.revenueImpact);
        acc.cancelledCommissionAdjustment = roundMoney2(
          acc.cancelledCommissionAdjustment + row.commissionImpact
        );
        acc.cancelledNetAdjustment = roundMoney2(acc.cancelledNetAdjustment + row.netImpact);
      } else {
        acc.activeRevenue = roundMoney2(acc.activeRevenue + row.totalAmount);
        acc.activeCommission = roundMoney2(acc.activeCommission + row.commission);
        acc.activeNet = roundMoney2(acc.activeNet + row.netEarnings);
        if (row.isCompletedPaid) {
          acc.completedCount += 1;
          acc.completedRevenue = roundMoney2(acc.completedRevenue + row.totalAmount);
          acc.completedCommission = roundMoney2(acc.completedCommission + row.commission);
          acc.completedNet = roundMoney2(acc.completedNet + row.netEarnings);
        } else {
          acc.pendingCount += 1;
        }
      }
      return acc;
    },
    {
      orderCount: 0,
      cancelledCount: 0,
      completedCount: 0,
      pendingCount: 0,
      completedRevenue: 0,
      completedCommission: 0,
      completedNet: 0,
      activeRevenue: 0,
      activeCommission: 0,
      activeNet: 0,
      cancelledRevenueAdjustment: 0,
      cancelledCommissionAdjustment: 0,
      cancelledNetAdjustment: 0,
      totalRevenueImpact: 0,
      totalCommissionImpact: 0,
      totalNetImpact: 0,
    }
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
  assertStoreDeliveryPaidBeforeDispatch(payload);
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
  aggregatePaidMaterialOrders,
  aggregatePaidMaterialOrdersBySupplier,
  aggregateCompletedPaidMaterialOrders,
  aggregateCompletedPaidMaterialOrdersBySupplier,
  buildSupplierOrdersExport,
  listRecentMaterialOrdersBySupplierForAdmin,
  orderTotalFromRow,
  createMaterialOrder,
  getMaterialOrders,
  getMaterialOrderById,
  updateMaterialOrderDelivery,
  approveMaterialOrderDelivery,
  approveMaterialOrderDeliveryBySupplier,
  rejectMaterialOrderDeliveryBySupplier,
  rejectMaterialOrderDelivery,
  submitDeliveryQuote,
  rejectDeliveryRequestByProvider,
  acceptDeliveryQuote,
  listDeliveryInboxForProvider,
  resolveAssignedCourierId,
  payMaterialOrderDelivery,
  markMaterialOrderDeliveryPaid,
  updateMaterialOrderDeliveryStatus,
  updateMaterialOrderFulfillment,
  updateMaterialOrderFulfillmentByProvider,
  confirmDeliveryReceipt,
  reportDeliveryIssue,
  syncMaterialOrderFulfillmentFromDeliveryRequest,
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
  syncJobStoreCourierDeliveryRequest,
  ensureCourierJobForMaterialOrder,
  resolveCourierUserId,
  resolveBranchForCourierDelivery,
  resolveCourierDeliveryGeoPoints,
  getJobMaterialOrdersForJob,
  emitSupplierMaterialOrderCreated,
};
