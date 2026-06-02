const { randomUUID } = require("crypto");
const { MaterialFulfillmentStatus } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const trackingService = require("./tracking.service");
const { createDefaultJobMeta } = require("./jobMeta.service");
const notificationEvents = require("./notificationEvents.service");

function roundMoney2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Map API status string to Prisma enum (requires generated client with courier values). */
function resolveFulfillmentEnum(status) {
  const key = String(status || "").toUpperCase();
  const value = MaterialFulfillmentStatus[key];
  if (!value) {
    throw new AppError(`Invalid fulfillment status: ${key}`, 400);
  }
  return value;
}

function buildGeoPoint(input = {}) {
  const point = {
    address: input.address != null ? String(input.address).trim() : "",
    city: input.city != null ? String(input.city).trim() : undefined,
    area: input.area != null ? String(input.area).trim() : undefined,
    suburb: input.suburb != null ? String(input.suburb).trim() : undefined,
    label: input.label != null ? String(input.label).trim() : undefined,
  };
  if (
    input.coordinates &&
    typeof input.coordinates === "object" &&
    Number.isFinite(Number(input.coordinates.lat)) &&
    Number.isFinite(Number(input.coordinates.lng))
  ) {
    point.coordinates = { lat: Number(input.coordinates.lat), lng: Number(input.coordinates.lng) };
  }
  return point;
}

function enrichDeliveryRequest(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    id: row.id,
    customerId: row.customerId,
    courierId: row.courierId || undefined,
    source: row.source,
    materialOrderId: row.materialOrderId || undefined,
    jobId: row.jobId || undefined,
    category: row.category,
    description: row.description || undefined,
    photos: Array.isArray(row.photos) ? row.photos : [],
    items: Array.isArray(row.items) ? row.items : row.items,
    collectionPoint: row.collectionPoint,
    destinationPoint: row.destinationPoint,
    status: row.status,
    quotedFee: row.quotedFee != null ? Number(row.quotedFee) : undefined,
    quoteNote: row.quoteNote || undefined,
    fulfillmentStatus: row.fulfillmentStatus,
    payload,
    createdAt: row.createdAt?.toISOString?.() || String(row.createdAt),
    updatedAt: row.updatedAt?.toISOString?.() || String(row.updatedAt),
    activeTrackingId: payload.activeTrackingId,
    activeTrackingToken: payload.activeTrackingToken,
    payment: payload.payment || { deliveryPaid: false },
    driverLocation:
      payload.driverLocation && typeof payload.driverLocation === "object"
        ? payload.driverLocation
        : undefined,
    courierPhase: payload.courierPhase ? String(payload.courierPhase) : undefined,
  };
}

async function createDeliveryRequest(customerId, body = {}) {
  const collectionPoint = buildGeoPoint(body.collectionPoint || {});
  const destinationPoint = buildGeoPoint(body.destinationPoint || {});
  if (!collectionPoint.address) throw new AppError("Collection address is required", 400);
  if (!destinationPoint.address) throw new AppError("Destination address is required", 400);
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) throw new AppError("At least one item is required", 400);
  const courierId = body.courierId ? String(body.courierId).trim() : "";
  if (!courierId) throw new AppError("Courier selection is required", 400);

  const category = String(body.category || "delivery").trim();
  const photos = Array.isArray(body.photos) ? body.photos.map(String) : [];
  const itemsSummary = items.map((i) => `${i.name || "Item"} x${i.qty || 1}`).join(", ");
  let description = body.description ? String(body.description).trim() : `Courier request: ${itemsSummary}`;
  if (description.length < 10) {
    description = `${description}. Delivery service request.`;
  }

  const existingJobId = body.jobId ? String(body.jobId).trim() : "";

  const { row: createdRow, linkedJobId } = await prisma.$transaction(async (tx) => {
    const row = await tx.deliveryRequest.create({
      data: {
        customerId: String(customerId),
        courierId,
        source: existingJobId ? "job_context" : "direct",
        jobId: existingJobId || undefined,
        category,
        description: body.description ? String(body.description).trim() : undefined,
        photos,
        items,
        collectionPoint,
        destinationPoint,
        status: "pending_quote",
        fulfillmentStatus: "PENDING",
        payload: {
          payment: { deliveryPaid: false },
          delivery: { status: "PendingApproval", providerId: courierId, fee: 0 },
        },
      },
    });

    let jobId = existingJobId || null;
    if (existingJobId) {
      const { mutateJobMeta } = require("./jobMeta.service");
      await mutateJobMeta(existingJobId, (m) => ({
        ...m,
        linkedDeliveryRequestId: row.id,
      }));
    }
    if (!jobId) {
      const meta = createDefaultJobMeta();
      meta.courierFlow = true;
      meta.deliveryRequestId = row.id;

      const job = await tx.job.create({
        data: {
          title: category === "moving" ? "Moving" : "Delivery / Courier",
          category,
          location: destinationPoint.city || destinationPoint.address || "UNKNOWN",
          locationDetails: {
            address: destinationPoint.address,
            city: destinationPoint.city,
            area: destinationPoint.area,
            suburb: destinationPoint.suburb,
            coordinates: destinationPoint.coordinates,
            collection: collectionPoint,
            destination: destinationPoint,
          },
          description,
          price: 0,
          images: photos,
          measurements: {
            source: "MANUAL",
            values: {},
            deliveryItems: items,
            collectionPoint,
            destinationPoint,
          },
          materials: [],
          customerId: String(customerId),
          providerId: courierId,
          status: "PENDING",
          meta,
        },
      });
      jobId = job.id;
      await tx.deliveryRequest.update({
        where: { id: row.id },
        data: { jobId },
      });
    }

    return { row, linkedJobId: jobId };
  });

  const row = await prisma.deliveryRequest.findUnique({ where: { id: createdRow.id } });

  try {
    await notificationEvents.notifyCourierDeliveryRequest(courierId, createdRow.id);
    if (linkedJobId) {
      await notificationEvents.notifyJobRequest(
        courierId,
        linkedJobId,
        category === "moving" ? "Moving" : "Delivery / Courier"
      );
    }
  } catch (e) {
    console.error("notifyCourierDeliveryRequest", e);
  }

  return enrichDeliveryRequest(row);
}

async function getDeliveryRequestByJobId(jobId, userId, role) {
  const row = await prisma.deliveryRequest.findFirst({
    where: { jobId: String(jobId) },
  });
  if (!row) return null;
  return getDeliveryRequestById(row.id, userId, role);
}

async function listDeliveryRequestsForCustomer(customerId) {
  const rows = await prisma.deliveryRequest.findMany({
    where: { customerId: String(customerId) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(enrichDeliveryRequest);
}

async function listDirectDeliveryInboxForCourier(courierId) {
  const rows = await prisma.deliveryRequest.findMany({
    where: { courierId: String(courierId) },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(enrichDeliveryRequest);
}

async function getDeliveryRequestById(id, userId, role) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  if (!row) return null;
  const uid = String(userId || "");
  const r = String(role || "").toUpperCase();
  if (r !== "ADMIN" && String(row.customerId) !== uid && String(row.courierId || "") !== uid) {
    throw new AppError("Forbidden", 403);
  }
  return enrichDeliveryRequest(row);
}

async function assertCourier(row, courierUserId) {
  if (!row) throw new AppError("Delivery request not found", 404);
  if (String(row.courierId || "") !== String(courierUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
}

async function submitDirectDeliveryQuote(id, courierUserId, { fee, note } = {}) {
  const safeFee = Math.max(0, roundMoney2(Number(fee || 0)));
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  await assertCourier(row, courierUserId);
  if (!["pending_quote", "quoted"].includes(String(row.status))) {
    throw new AppError("Cannot quote in current state", 400);
  }
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload.deliveryQuote = {
    fee: safeFee,
    note: note ? String(note).trim() : "",
    submittedAt: new Date().toISOString(),
  };
  payload.delivery = { ...(payload.delivery || {}), status: "Quoted", fee: safeFee, providerId: row.courierId };
  const updated = await prisma.deliveryRequest.update({
    where: { id: row.id },
    data: {
      status: "quoted",
      quotedFee: safeFee,
      quoteNote: note ? String(note).trim() : null,
      payload,
    },
  });
  try {
    const notificationEvents = require("./notificationEvents.service");
    await notificationEvents.notifyDeliveryQuoteSubmitted(row.customerId, row.id, safeFee, row.jobId || undefined);
  } catch (e) {
    console.error("notifyDeliveryQuoteSubmitted", e);
  }
  return enrichDeliveryRequest(updated);
}

async function rejectDirectDeliveryRequest(id, courierUserId, reason) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  await assertCourier(row, courierUserId);
  if (!["pending_quote", "quoted"].includes(String(row.status))) {
    throw new AppError("Cannot reject in current state", 400);
  }
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload.delivery = { ...(payload.delivery || {}), status: "Rejected" };
  const updated = await prisma.deliveryRequest.update({
    where: { id: row.id },
    data: { status: "rejected", payload },
  });
  return enrichDeliveryRequest(updated);
}

async function acceptDirectDeliveryQuote(id, customerUserId) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  if (!row) throw new AppError("Delivery request not found", 404);
  if (String(row.customerId) !== String(customerUserId)) throw new AppError("Forbidden", 403);
  if (String(row.status) !== "quoted") throw new AppError("No quote to accept", 400);
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload.delivery = {
    ...(payload.delivery || {}),
    status: "Approved",
    fee: Number(row.quotedFee || 0),
  };
  const updated = await prisma.deliveryRequest.update({
    where: { id: row.id },
    data: { status: "approved", payload },
  });
  return enrichDeliveryRequest(updated);
}

async function payDirectDeliveryRequest(id, customerUserId, fee) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  if (!row) throw new AppError("Delivery request not found", 404);
  if (String(row.customerId) !== String(customerUserId)) throw new AppError("Forbidden", 403);
  if (String(row.status) !== "approved") throw new AppError("Delivery must be approved before payment", 400);
  const safeFee = roundMoney2(Number(fee ?? row.quotedFee ?? 0));
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload.payment = { deliveryPaid: true };
  payload.delivery = { ...(payload.delivery || {}), status: "Processing", fee: safeFee };
  const updated = await prisma.deliveryRequest.update({
    where: { id: row.id },
    data: {
      status: "paid",
      quotedFee: safeFee,
      fulfillmentStatus: MaterialFulfillmentStatus.READY,
      payload,
    },
  });
  try {
    await syncCourierJobFromDeliveryRow(updated, "paid");
  } catch (e) {
    console.error("syncCourierJobFromDeliveryRow paid", e);
  }
  return enrichDeliveryRequest(updated);
}

async function syncCourierJobFromDeliveryRow(row, event) {
  if (!row?.jobId) return;
  const { getJobMeta, mutateJobMeta } = require("./jobMeta.service");
  const meta = await getJobMeta(row.jobId);
  if (!meta || !meta.courierFlow) return;

  const jobService = require("./job.service");
  if (event === "paid") {
    await jobService.updateJobStatus(row.jobId, "SERVICE_PAID");
    await mutateJobMeta(row.jobId, (m) => ({
      ...m,
      hasStarted: true,
      progressStep: Math.max(Number(m.progressStep) || 0, 2),
    }));
    return;
  }
  if (event === "COLLECTING" || event === "COLLECTED") {
    await mutateJobMeta(row.jobId, (m) => ({
      ...m,
      hasStarted: true,
      progressStep: Math.max(Number(m.progressStep) || 0, 2),
    }));
    return;
  }
  if (event === "OUT_FOR_DELIVERY" || event === "AT_DESTINATION") {
    await jobService.updateJobStatus(row.jobId, "IN_PROGRESS");
    await mutateJobMeta(row.jobId, (m) => ({
      ...m,
      hasStarted: true,
      progressStep: Math.max(Number(m.progressStep) || 0, 3),
    }));
    return;
  }
  if (event === "COMPLETED") {
    await jobService.updateJobStatus(row.jobId, "AWAITING_CONFIRMATION");
    await mutateJobMeta(row.jobId, (m) => ({
      ...m,
      progressStep: Math.max(Number(m.progressStep) || 0, 4),
    }));
  }
}

async function rejectDeliveryRequestsForJob(jobId, actorUserId) {
  const rows = await prisma.deliveryRequest.findMany({
    where: { jobId: String(jobId) },
  });
  for (const row of rows) {
    if (!["pending_quote", "quoted", "approved"].includes(String(row.status))) continue;
    try {
      await rejectDirectDeliveryRequest(row.id, actorUserId || row.courierId, "job_declined");
    } catch (e) {
      console.error("rejectDeliveryRequestsForJob", row.id, e);
    }
  }
}

const COURIER_FULFILLMENT_STATUSES = [
  "COLLECTING",
  "COLLECTED",
  "OUT_FOR_DELIVERY",
  "AT_DESTINATION",
  "COMPLETED",
  "FAILED",
  "DELAYED",
];

function assertCourierFulfillmentTransition(current, next) {
  const c = String(current || "READY").toUpperCase();
  const n = String(next).toUpperCase();
  const allowed = {
    PENDING: ["COLLECTING"],
    READY: ["COLLECTING"],
    COLLECTING: ["COLLECTED", "FAILED", "DELAYED"],
    COLLECTED: ["OUT_FOR_DELIVERY", "FAILED", "DELAYED"],
    OUT_FOR_DELIVERY: ["AT_DESTINATION", "COMPLETED", "FAILED", "DELAYED"],
    AT_DESTINATION: ["COMPLETED", "FAILED"],
    DELAYED: ["COLLECTING", "COLLECTED", "OUT_FOR_DELIVERY", "AT_DESTINATION", "FAILED"],
  };
  const list = allowed[c] || [];
  if (!list.includes(n)) {
    throw new AppError(`Cannot move from ${c} to ${n}`, 400);
  }
}

async function updateDirectDeliveryFulfillment(id, courierUserId, nextStatus) {
  const next = String(nextStatus || "").toUpperCase();
  if (!COURIER_FULFILLMENT_STATUSES.includes(next)) {
    throw new AppError("Invalid fulfillment status", 400);
  }
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  await assertCourier(row, courierUserId);
  if (String(row.status) !== "paid") {
    throw new AppError("Delivery must be paid before fulfillment updates", 400);
  }
  let current = String(row.fulfillmentStatus || "READY").toUpperCase();
  if (current === "PENDING" && String(row.status) === "paid") {
    current = "READY";
  }
  if (!["FAILED", "DELAYED"].includes(next)) {
    assertCourierFulfillmentTransition(current, next);
  }
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  if (next === "COLLECTING") {
    const session = await trackingService.createActiveTrackingSessionForDeliveryRequest(row.id, {
      trackingSource: "provider",
    });
    payload.activeTrackingId = session.trackingId;
    if (session.accessToken) payload.activeTrackingToken = session.accessToken;
    payload.courierPhase = "to_collection";
  }
  if (next === "OUT_FOR_DELIVERY") {
    if (!payload.activeTrackingId) {
      const session = await trackingService.createActiveTrackingSessionForDeliveryRequest(row.id, {
        trackingSource: "provider",
      });
      payload.activeTrackingId = session.trackingId;
      if (session.accessToken) payload.activeTrackingToken = session.accessToken;
    }
    payload.courierPhase = "to_destination";
  }
  if (next === "COLLECTED") {
    payload.courierPhase = "at_collection";
  }
  if (next === "AT_DESTINATION") {
    payload.courierPhase = "at_destination";
  }
  if (["COMPLETED", "FAILED"].includes(next)) {
    await trackingService.deactivateSessionsForDeliveryRequest(row.id, next);
    payload.activeTrackingId = undefined;
    payload.activeTrackingToken = undefined;
    payload.courierPhase = next === "COMPLETED" ? "completed" : "failed";
  }
  const statusMap = {
    COLLECTING: "in_transit",
    COLLECTED: "in_transit",
    OUT_FOR_DELIVERY: "in_transit",
    AT_DESTINATION: "in_transit",
    COMPLETED: "completed",
    FAILED: "cancelled",
    DELAYED: "in_transit",
  };
  const updated = await prisma.deliveryRequest.update({
    where: { id: row.id },
    data: {
      fulfillmentStatus: resolveFulfillmentEnum(next),
      status: statusMap[next] || row.status,
      payload,
    },
  });
  try {
    await syncCourierJobFromDeliveryRow(updated, next);
  } catch (e) {
    console.error("syncCourierJobFromDeliveryRow", e);
  }
  return enrichDeliveryRequest(updated);
}

module.exports = {
  createDeliveryRequest,
  listDeliveryRequestsForCustomer,
  listDirectDeliveryInboxForCourier,
  getDeliveryRequestById,
  getDeliveryRequestByJobId,
  submitDirectDeliveryQuote,
  rejectDirectDeliveryRequest,
  acceptDirectDeliveryQuote,
  payDirectDeliveryRequest,
  updateDirectDeliveryFulfillment,
  rejectDeliveryRequestsForJob,
  enrichDeliveryRequest,
};
