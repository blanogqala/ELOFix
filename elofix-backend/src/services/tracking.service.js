const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const supplierService = require("./supplier.service");
const { materialOrderBelongsToSupplierStore } = require("../utils/materialOrderSupplier.util");

/** ~12m — skip DB + socket if driver barely moved (reduces load). */
const MIN_LOCATION_DELTA_METERS = 12;

const SESSION_STALE_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function trackingLog(event, data = {}) {
  try {
    console.log(
      JSON.stringify({ ns: "tracking", event, at: new Date().toISOString(), ...data })
    );
  } catch (_) {
    /* ignore */
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emitOrderLocationUpdate(orderId, lat, lng) {
  try {
    if (!global.io || !orderId) return;
    const oid = String(orderId);
    global.io.to(oid).emit("order:location:update", { orderId: oid, lat, lng });
  } catch (e) {
    console.error("emitOrderLocationUpdate", e);
  }
}

function isValidCoord(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return false;
  return true;
}

function assertSessionUsable(session, accessToken) {
  if (!session || !session.isActive) {
    throw new AppError("Tracking session not found", 404);
  }
  const now = new Date();
  if (session.expiresAt && new Date(session.expiresAt) < now) {
    throw new AppError("Tracking link has expired", 410);
  }
  if (session.accessToken) {
    const t = accessToken != null ? String(accessToken) : "";
    if (t !== session.accessToken) {
      throw new AppError("Invalid tracking token", 403);
    }
  }
}

async function expireOldSessions() {
  const now = new Date();
  const stale = new Date(Date.now() - SESSION_STALE_MS);
  try {
    await prisma.trackingSession.updateMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: { lt: now } },
          { AND: [{ lastPingAt: { not: null } }, { lastPingAt: { lt: stale } }] },
          { AND: [{ lastPingAt: null }, { createdAt: { lt: stale } }] },
        ],
      },
      data: { isActive: false },
    });

    /* Stop tracking for finished deliveries (COMPLETED always in enum) */
    await prisma.trackingSession.updateMany({
      where: {
        isActive: true,
        order: { fulfillmentStatus: "COMPLETED" },
      },
      data: { isActive: false },
    });

    /* FAILED / CANCELLED require migrated enum — skip gracefully if DB not migrated yet */
    try {
      await prisma.trackingSession.updateMany({
        where: {
          isActive: true,
          order: { fulfillmentStatus: { in: ["FAILED", "CANCELLED"] } },
        },
        data: { isActive: false },
      });
    } catch (e) {
      if (e && e.code === "P2007") {
        trackingLog("expireOldSessions_skip_failed_cancelled", {
          hint: "Run prisma migrate deploy to add MaterialFulfillmentStatus values",
        });
      } else {
        console.error("expireOldSessions terminal FAILED/CANCELLED", e);
      }
    }
  } catch (e) {
    console.error("expireOldSessions", e);
  }
}

async function deactivateSessionsForOrder(orderId, reason = "fulfillment_terminal") {
  const oid = String(orderId);
  try {
    const r = await prisma.trackingSession.updateMany({
      where: { orderId: oid, isActive: true },
      data: { isActive: false },
    });
    if (r.count > 0) {
      trackingLog("tracking_sessions_deactivated", { orderId: oid, reason, count: r.count });
    }
  } catch (e) {
    console.error("deactivateSessionsForOrder", e);
  }
}

/**
 * Provider courier takes over GPS authority (same tracking row when possible).
 */
async function ensureProviderTrackingLead(orderId) {
  const oid = String(orderId);
  await expireOldSessions();
  const active = await prisma.trackingSession.findFirst({
    where: { orderId: oid, isActive: true },
  });
  const envSingleUse = process.env.TRACKING_ACCESS_TOKEN_SINGLE_USE === "true";
  if (active) {
    await prisma.trackingSession.update({
      where: { id: active.id },
      data: { currentTrackingSource: "provider" },
    });
    trackingLog("tracking_source_override", { orderId: oid, currentTrackingSource: "provider" });
    return;
  }
  await createActiveTrackingSession(oid, {
    trackingSource: "provider",
    accessTokenSingleUse: envSingleUse,
  });
}

/**
 * Persist last driver position — skips if incoming role does not match session source.
 */
async function persistAndEmitDriverLocation(orderId, lat, lng, options = {}) {
  const source = options.source === "provider" ? "provider" : "supplier";
  const oid = String(orderId);
  if (!isValidCoord(lat, lng)) {
    throw new AppError("Invalid coordinates", 400);
  }
  const la = Number(lat);
  const lo = Number(lng);
  const now = new Date();

  await expireOldSessions();

  let session = await prisma.trackingSession.findFirst({
    where: { orderId: oid, isActive: true },
  });

  if (!session && source === "provider") {
    await ensureProviderTrackingLead(oid);
    session = await prisma.trackingSession.findFirst({
      where: { orderId: oid, isActive: true },
    });
  }

  if (session) {
    const lead = String(session.currentTrackingSource || "supplier");
    if (lead !== source) {
      trackingLog("location_update_ignored_source", { orderId: oid, incomingSource: source, sessionSource: lead });
      return { skipped: true, reason: "source_mismatch" };
    }
  } else if (source === "supplier") {
    trackingLog("location_update_ignored_no_session", { orderId: oid, source });
    return { skipped: true, reason: "no_session" };
  }

  const row = await prisma.materialOrder.findUnique({ where: { id: oid } });
  const prevPayload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const prevDl = prevPayload.driverLocation;
  let prevLa = session?.lastLat != null ? Number(session.lastLat) : null;
  let prevLo = session?.lastLng != null ? Number(session.lastLng) : null;
  if (
    prevDl &&
    Number.isFinite(Number(prevDl.lat)) &&
    Number.isFinite(Number(prevDl.lng)) &&
    (prevLa == null || !Number.isFinite(prevLa))
  ) {
    prevLa = Number(prevDl.lat);
    prevLo = Number(prevDl.lng);
  }
  if (
    prevLa != null &&
    prevLo != null &&
    Number.isFinite(prevLa) &&
    Number.isFinite(prevLo) &&
    haversineMeters(prevLa, prevLo, la, lo) < MIN_LOCATION_DELTA_METERS
  ) {
    return { skipped: true };
  }

  if (session) {
    await prisma.trackingSession.updateMany({
      where: { orderId: oid, isActive: true },
      data: { lastLat: la, lastLng: lo, lastPingAt: now },
    });
  }

  if (row?.payload && typeof row.payload === "object") {
    const payload = { ...row.payload, driverLocation: { lat: la, lng: lo, updatedAt: now.toISOString() } };
    await prisma.materialOrder.update({
      where: { id: oid },
      data: { payload },
    });
  }

  emitOrderLocationUpdate(oid, la, lo);
  trackingLog("location_update_persisted", { orderId: oid, source, lat: la, lng: lo });
  await expireOldSessions();
  return { skipped: false };
}

async function saveLocationByTrackingId(trackingId, lat, lng, accessToken) {
  const session = await prisma.trackingSession.findFirst({
    where: { trackingId: String(trackingId), isActive: true },
  });
  assertSessionUsable(session, accessToken);
  if (String(session.currentTrackingSource || "supplier") !== "supplier") {
    trackingLog("public_tracking_post_ignored_non_supplier", { orderId: session.orderId });
    return;
  }
  await persistAndEmitDriverLocation(session.orderId, lat, lng, { source: "supplier" });
}

/** Deactivate existing sessions for order, create new public tracking id. */
async function createActiveTrackingSession(orderId, options = {}) {
  const oid = String(orderId);
  const trackingSource = options.trackingSource === "provider" ? "provider" : "supplier";
  const accessTokenSingleUse = Boolean(options.accessTokenSingleUse);
  await prisma.trackingSession.updateMany({
    where: { orderId: oid },
    data: { isActive: false },
  });
  const trackingId = randomUUID();
  const accessToken = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.trackingSession.create({
    data: {
      orderId: oid,
      trackingId,
      accessToken,
      expiresAt,
      isActive: true,
      currentTrackingSource: trackingSource,
      accessTokenSingleUse,
    },
  });
  trackingLog("tracking_started", { orderId: oid, trackingSource, trackingId });
  return { trackingId, accessToken };
}

async function deactivateSessionsForDeliveryRequest(deliveryRequestId, reason = "fulfillment_terminal") {
  const did = String(deliveryRequestId);
  try {
    await prisma.trackingSession.updateMany({
      where: { deliveryRequestId: did, isActive: true },
      data: { isActive: false },
    });
    trackingLog("tracking_sessions_deactivated", { deliveryRequestId: did, reason });
  } catch (e) {
    console.error("deactivateSessionsForDeliveryRequest", e);
  }
}

async function createActiveTrackingSessionForDeliveryRequest(deliveryRequestId, options = {}) {
  const did = String(deliveryRequestId);
  const trackingSource = options.trackingSource === "provider" ? "provider" : "supplier";
  await prisma.trackingSession.updateMany({
    where: { deliveryRequestId: did },
    data: { isActive: false },
  });
  const trackingId = randomUUID();
  const accessToken = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.trackingSession.create({
    data: {
      deliveryRequestId: did,
      trackingId,
      accessToken,
      expiresAt,
      isActive: true,
      currentTrackingSource: trackingSource,
    },
  });
  trackingLog("tracking_started", { deliveryRequestId: did, trackingSource, trackingId });
  return { trackingId, accessToken };
}

async function persistAndEmitDeliveryRequestLocation(deliveryRequestId, lat, lng, options = {}) {
  const source = options.source === "provider" ? "provider" : "supplier";
  const did = String(deliveryRequestId);
  if (!isValidCoord(lat, lng)) throw new AppError("Invalid coordinates", 400);
  const la = Number(lat);
  const lo = Number(lng);
  let session = await prisma.trackingSession.findFirst({
    where: { deliveryRequestId: did, isActive: true },
  });
  if (!session && source === "provider") {
    await createActiveTrackingSessionForDeliveryRequest(did, { trackingSource: "provider" });
    session = await prisma.trackingSession.findFirst({
      where: { deliveryRequestId: did, isActive: true },
    });
  }
  if (session) {
    await prisma.trackingSession.update({
      where: { id: session.id },
      data: { lastLat: la, lastLng: lo, lastPingAt: new Date() },
    });
  }
  const row = await prisma.deliveryRequest.findUnique({ where: { id: did } });
  if (row) {
    const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
    payload.driverLocation = { lat: la, lng: lo, updatedAt: new Date().toISOString() };
    await prisma.deliveryRequest.update({ where: { id: did }, data: { payload } });
  }
  try {
    if (global.io) {
      global.io.to(did).emit("order:location:update", { orderId: did, lat: la, lng: lo });
    }
  } catch (e) {
    console.error("emitDeliveryRequestLocation", e);
  }
  return { skipped: false };
}

async function canUserPostDeliveryRequestLocation(userId, deliveryRequestId) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(deliveryRequestId) } });
  if (!row) return false;
  return String(row.courierId || "") === String(userId || "");
}

async function getPublicTrackingView(trackingId, accessToken) {
  await expireOldSessions();
  const session = await prisma.trackingSession.findFirst({
    where: { trackingId: String(trackingId), isActive: true },
    include: {
      order: {
        select: {
          id: true,
          fulfillmentStatus: true,
          payload: true,
        },
      },
    },
  });
  if (!session || !session.order) {
    throw new AppError("Tracking link is invalid or expired", 404);
  }
  assertSessionUsable(session, accessToken);

  const payload = session.order.payload && typeof session.order.payload === "object" ? session.order.payload : {};
  const batch = payload.materialBatch && typeof payload.materialBatch === "object" ? payload.materialBatch : {};
  const dest =
    batch.deliveryAddress != null && String(batch.deliveryAddress).trim() !== ""
      ? String(batch.deliveryAddress)
      : String(payload.storeName || "Destination");
  const fromSession =
    session.lastLat != null && session.lastLng != null
      ? { lat: Number(session.lastLat), lng: Number(session.lastLng) }
      : null;
  const fromPayload = payload.driverLocation;
  const coords =
    fromSession && Number.isFinite(fromSession.lat) && Number.isFinite(fromSession.lng)
      ? fromSession
      : fromPayload &&
          Number.isFinite(Number(fromPayload.lat)) &&
          Number.isFinite(Number(fromPayload.lng))
        ? { lat: Number(fromPayload.lat), lng: Number(fromPayload.lng) }
        : null;

  return {
    orderId: session.orderId,
    fulfillmentStatus: session.order.fulfillmentStatus,
    destinationLabel: dest,
    isActive: session.isActive,
    lastLocation: coords,
    expiresAt: session.expiresAt instanceof Date ? session.expiresAt.toISOString() : String(session.expiresAt || ""),
  };
}

async function getLatestLocationForDeliveryRequest(deliveryRequestId) {
  const did = String(deliveryRequestId);
  const session = await prisma.trackingSession.findFirst({
    where: { deliveryRequestId: did, isActive: true },
  });
  const row = await prisma.deliveryRequest.findUnique({ where: { id: did } });
  const pay = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const dl = pay.driverLocation;
  let lastLat = null;
  let lastLng = null;
  let lastPingAt = null;
  if (session?.lastLat != null && session?.lastLng != null) {
    lastLat = Number(session.lastLat);
    lastLng = Number(session.lastLng);
    lastPingAt = session.lastPingAt;
  }
  if (dl && Number.isFinite(Number(dl.lat)) && Number.isFinite(Number(dl.lng))) {
    const dlTime = dl.updatedAt ? new Date(dl.updatedAt).getTime() : 0;
    const sessTime = lastPingAt ? new Date(lastPingAt).getTime() : 0;
    if (!lastPingAt || dlTime >= sessTime) {
      lastLat = Number(dl.lat);
      lastLng = Number(dl.lng);
      lastPingAt = dl.updatedAt ? new Date(dl.updatedAt) : lastPingAt;
    }
  }
  return {
    lastLat,
    lastLng,
    lastPingAt: lastPingAt ? (lastPingAt instanceof Date ? lastPingAt.toISOString() : String(lastPingAt)) : null,
  };
}

async function getLatestLocationForOrder(orderId, userId, role) {
  const ok = await canUserAccessOrderRoom(userId, role, orderId);
  if (!ok) {
    throw new AppError("Forbidden", 403);
  }
  await expireOldSessions();
  const sid = String(orderId);
  const dr = await prisma.deliveryRequest.findUnique({ where: { id: sid } });
  if (dr) {
    return getLatestLocationForDeliveryRequest(sid);
  }
  const session = await prisma.trackingSession.findFirst({
    where: { orderId: sid, isActive: true },
  });
  const row = await prisma.materialOrder.findUnique({ where: { id: sid } });
  const pay = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const dl = pay.driverLocation;

  let lastLat = null;
  let lastLng = null;
  let lastPingAt = null;

  if (session?.lastLat != null && session?.lastLng != null) {
    lastLat = Number(session.lastLat);
    lastLng = Number(session.lastLng);
    lastPingAt = session.lastPingAt;
  }

  if (dl && Number.isFinite(Number(dl.lat)) && Number.isFinite(Number(dl.lng))) {
    const dlTime = dl.updatedAt ? new Date(dl.updatedAt).getTime() : 0;
    const sessTime = lastPingAt ? new Date(lastPingAt).getTime() : 0;
    if (!lastPingAt || dlTime >= sessTime) {
      lastLat = Number(dl.lat);
      lastLng = Number(dl.lng);
      lastPingAt = dl.updatedAt ? new Date(dl.updatedAt) : lastPingAt;
    }
  }

  return {
    lastLat,
    lastLng,
    lastPingAt: lastPingAt ? (lastPingAt instanceof Date ? lastPingAt.toISOString() : String(lastPingAt)) : null,
  };
}

async function canUserAccessDeliveryRequestRoom(userId, role, deliveryRequestId) {
  const uid = String(userId || "");
  const did = String(deliveryRequestId || "");
  if (!uid || !did) return false;
  const r = String(role || "").toUpperCase();
  if (r === "ADMIN") return true;
  const row = await prisma.deliveryRequest.findUnique({ where: { id: did } });
  if (!row) return false;
  if (r === "CUSTOMER" || r === "USER") return String(row.customerId) === uid;
  if (r === "PROVIDER") return String(row.courierId || "") === uid;
  return false;
}

async function canUserAccessOrderRoom(userId, role, orderId) {
  const uid = String(userId || "");
  const oid = String(orderId || "");
  if (!uid || !oid) return false;
  const r = String(role || "").toUpperCase();

  if (r === "ADMIN") return true;

  const drOk = await canUserAccessDeliveryRequestRoom(userId, role, oid);
  if (drOk) return true;

  const row = await prisma.materialOrder.findUnique({
    where: { id: oid },
    include: { job: { select: { providerId: true, customerId: true } } },
  });
  if (!row) return false;

  /** DB uses CUSTOMER; tolerate JWT/client quirks (USER) and job-linked rows where userId must match job owner */
  const isCustomerLike = r === "CUSTOMER" || r === "USER";
  if (isCustomerLike) {
    if (String(row.userId) === uid) return true;
    if (row.job && String(row.job.customerId || "") === uid) return true;
    return false;
  }

  if (r === "PROVIDER" && row.job && String(row.job.providerId || "") === uid) return true;

  if (r === "SUPPLIER") {
    try {
      const sup = await supplierService.findSupplierRecordByUserId(uid);
      if (sup && (await materialOrderBelongsToSupplierStore(row, sup.id))) return true;
    } catch (_) {
      return false;
    }
  }

  if (r === "BRANCH_STAFF") {
    const bu = await prisma.branchUser.findUnique({
      where: { id: uid },
      include: { branch: { select: { supplierId: true } } },
    });
    if (!bu) return false;
    return (
      String(row.branchId || "") === String(bu.branchId) &&
      String(row.supplierId || "") === String(bu.branch.supplierId)
    );
  }

  return false;
}

/** Who may push GPS: supplier (store delivery), provider (courier job), not customer. */
async function canUserPostDriverLocation(userId, role, orderId) {
  const uid = String(userId || "");
  const oid = String(orderId || "");
  if (!uid || !oid) return false;
  const r = String(role || "").toUpperCase();

  const row = await prisma.materialOrder.findUnique({
    where: { id: oid },
    include: { job: { select: { providerId: true } } },
  });
  if (!row) return false;

  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const deliveryType = String(payload.deliveryType || "SELF").toUpperCase();

  if (r === "PROVIDER" && deliveryType === "DELIVERY_PROVIDER") {
    const batch =
      payload.materialBatch && typeof payload.materialBatch === "object" ? payload.materialBatch : {};
    const assignedCourierId = String(
      batch.assignedDriverId || payload.deliveryProviderId || payload.delivery?.providerId || ""
    ).trim();
    if (assignedCourierId && assignedCourierId === uid) return true;
  }

  if (r === "SUPPLIER") {
    try {
      const sup = await supplierService.findSupplierRecordByUserId(uid);
      if (sup && (await materialOrderBelongsToSupplierStore(row, sup.id))) {
        if (deliveryType === "STORE_DELIVERY") return true;
      }
    } catch (_) {
      return false;
    }
  }

  if (r === "BRANCH_STAFF") {
    const bu = await prisma.branchUser.findUnique({
      where: { id: uid },
      include: { branch: { select: { supplierId: true } } },
    });
    if (!bu) return false;
    const okOrder =
      String(row.branchId || "") === String(bu.branchId) &&
      String(row.supplierId || "") === String(bu.branch.supplierId);
    if (okOrder && deliveryType === "STORE_DELIVERY") return true;
  }

  return false;
}

module.exports = {
  emitOrderLocationUpdate,
  persistAndEmitDriverLocation,
  saveLocationByTrackingId,
  createActiveTrackingSession,
  ensureProviderTrackingLead,
  deactivateSessionsForOrder,
  getPublicTrackingView,
  getLatestLocationForOrder,
  expireOldSessions,
  canUserAccessOrderRoom,
  canUserPostDriverLocation,
  createActiveTrackingSessionForDeliveryRequest,
  deactivateSessionsForDeliveryRequest,
  persistAndEmitDeliveryRequestLocation,
  canUserPostDeliveryRequestLocation,
  isValidCoord,
  haversineMeters,
  trackingLog,
};
