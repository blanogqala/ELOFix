const { randomUUID } = require("crypto");
const { MaterialFulfillmentStatus, Prisma } = require("@prisma/client");
const AppError = require("../utils/AppError");
const prisma = require("../config/prisma");
const trackingService = require("./tracking.service");
const { createDefaultJobMeta } = require("./jobMeta.service");
const notificationEvents = require("./notificationEvents.service");
const { assertCustomerNotBlocked } = require("./accountStatus.service");

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

function normalizeAddressKey(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertDistinctAddresses(collection, destination) {
  const c = normalizeAddressKey(collection?.address);
  const d = normalizeAddressKey(destination?.address);
  if (c && d && c === d) {
    throw new AppError(
      "Collection and destination addresses must be different. Collection must be the supplier store; destination is the job site.",
      400
    );
  }
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

function enrichDeliveryRequest(row, materialContext = null) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const customerCompletion =
    payload.customerCompletion && typeof payload.customerCompletion === "object"
      ? payload.customerCompletion
      : undefined;
  const ctx = materialContext && typeof materialContext === "object" ? materialContext : {};
  const customerRating =
    ctx.customerRating ||
    (customerCompletion?.rating != null
      ? {
          rating: Number(customerCompletion.rating),
          comment: customerCompletion.comment || undefined,
          createdAt: customerCompletion.ratedAt || customerCompletion.confirmedAt,
        }
      : undefined);
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
    deliveryConfirmed: ctx.deliveryConfirmed === true,
    deliveryConfirmedAt: ctx.deliveryConfirmedAt || customerCompletion?.confirmedAt || undefined,
    customerRating,
    customerCompletion,
  };
}

async function loadMaterialOrderDeliveryContext(materialOrderId) {
  const mid = String(materialOrderId || "").trim();
  if (!mid) return null;
  const order = await prisma.materialOrder.findUnique({
    where: { id: mid },
    include: { materialRating: true },
  });
  if (!order) return null;
  const pload = order.payload && typeof order.payload === "object" ? order.payload : {};
  return {
    deliveryStatus: pload.delivery?.status ? String(pload.delivery.status) : undefined,
    deliveryConfirmed: pload.deliveryConfirmed === true,
    deliveryConfirmedAt: pload.deliveryConfirmedAt || undefined,
    customerRating: order.materialRating
      ? {
          rating: order.materialRating.rating,
          comment: order.materialRating.comment || undefined,
          createdAt: order.materialRating.createdAt?.toISOString?.() || String(order.materialRating.createdAt),
        }
      : undefined,
  };
}

async function syncDeliveryRequestApprovedFromMaterialOrder(materialOrderId, quotedFee) {
  const moId = String(materialOrderId || "").trim();
  if (!moId) return null;
  const dr = await prisma.deliveryRequest.findFirst({
    where: { materialOrderId: moId },
    orderBy: { createdAt: "desc" },
  });
  if (!dr || String(dr.status) !== "quoted") return null;
  const fee = Number(quotedFee ?? dr.quotedFee ?? 0);
  const payload = dr.payload && typeof dr.payload === "object" ? { ...dr.payload } : {};
  payload.delivery = {
    ...(payload.delivery || {}),
    status: "Approved",
    fee,
  };
  return prisma.deliveryRequest.update({
    where: { id: dr.id },
    data: { status: "approved", payload },
  });
}

async function enrichDeliveryRequestAsync(row) {
  let currentRow = row;
  if (row?.materialOrderId) {
    const ctx = await loadMaterialOrderDeliveryContext(row.materialOrderId);
    if (
      ctx &&
      String(currentRow.status) === "quoted" &&
      String(ctx.deliveryStatus || "") === "Approved"
    ) {
      try {
        const repaired = await syncDeliveryRequestApprovedFromMaterialOrder(
          row.materialOrderId,
          currentRow.quotedFee
        );
        if (repaired) currentRow = repaired;
      } catch (e) {
        console.error("enrichDeliveryRequestAsync self-heal approved", e);
      }
    }
    return enrichDeliveryRequest(currentRow, ctx);
  }
  return enrichDeliveryRequest(currentRow, null);
}

/** Paid and actively being fulfilled (status moves to in_transit after collection starts). */
function isDeliveryRequestPaidForFulfillment(row) {
  if (!row) return false;
  const status = String(row.status || "").toLowerCase();
  if (["paid", "in_transit", "completed"].includes(status)) return true;
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return payload.payment?.deliveryPaid === true;
}

async function createDeliveryRequest(customerId, body = {}) {
  const customer = await prisma.user.findUnique({
    where: { id: String(customerId) },
    select: { blocked: true },
  });
  assertCustomerNotBlocked(customer);

  const collectionPoint = buildGeoPoint(body.collectionPoint || {});
  const destinationPoint = buildGeoPoint(body.destinationPoint || {});
  if (!collectionPoint.address) throw new AppError("Collection address is required", 400);
  if (!destinationPoint.address) throw new AppError("Destination address is required", 400);
  assertDistinctAddresses(collectionPoint, destinationPoint);
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

  return enrichDeliveryRequestAsync(row);
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
  return Promise.all(rows.map((row) => enrichDeliveryRequestAsync(row)));
}

async function listDirectDeliveryInboxForCourier(courierId) {
  const rows = await prisma.deliveryRequest.findMany({
    where: { courierId: String(courierId) },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(rows.map((row) => enrichDeliveryRequestAsync(row)));
}

async function getDeliveryRequestById(id, userId, role) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  if (!row) return null;
  const uid = String(userId || "");
  const r = String(role || "").toUpperCase();
  if (r !== "ADMIN" && String(row.customerId) !== uid && String(row.courierId || "") !== uid) {
    throw new AppError("Forbidden", 403);
  }
  return enrichDeliveryRequestAsync(row);
}

async function assertCourier(row, courierUserId) {
  if (!row) throw new AppError("Delivery request not found", 404);
  if (String(row.courierId || "") !== String(courierUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
}

async function submitDirectDeliveryQuote(id, courierUserId, { fee, note } = {}) {
  const refundRecovery = require("./refundRecovery.service");
  await refundRecovery.assertProviderUserNoOverdueRefundDebt(courierUserId);

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
  await syncMaterialOrderDeliveryFromRow(updated, "quote", { fee: safeFee, note });
  try {
    await syncCourierJobPricingFromDeliveryRow(updated, { paid: false });
  } catch (e) {
    console.error("syncCourierJobPricingFromDeliveryRow quote", e);
  }
  return enrichDeliveryRequestAsync(updated);
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
  await syncMaterialOrderDeliveryFromRow(updated, "reject", { reason });
  return enrichDeliveryRequestAsync(updated);
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
  if (row.materialOrderId) {
    try {
      const materialOrderService = require("./materialOrder.service");
      await materialOrderService.acceptDeliveryQuote(row.materialOrderId, customerUserId);
    } catch (e) {
      console.error("acceptDirectDeliveryQuote sync material order", e);
    }
  }
  return enrichDeliveryRequestAsync(updated);
}

function buildDeliveryPaymentPayload(row, safeFee, paymentExtras = {}) {
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload.payment = {
    deliveryPaid: true,
    ...(paymentExtras.merchantReference ? { merchantReference: String(paymentExtras.merchantReference) } : {}),
    ...(paymentExtras.provider ? { provider: String(paymentExtras.provider) } : {}),
    ...(paymentExtras.gatewayTransactionId
      ? { gatewayTransactionId: String(paymentExtras.gatewayTransactionId) }
      : {}),
    ...(paymentExtras.paidAt ? { paidAt: String(paymentExtras.paidAt) } : {}),
  };
  payload.delivery = { ...(payload.delivery || {}), status: "Processing", fee: safeFee };
  if (paymentExtras.invoiceId) {
    payload.deliveryInvoiceId = String(paymentExtras.invoiceId);
  }
  return payload;
}

async function applyDeliveryPayment(row, safeFee, paymentExtras = {}) {
  if (String(row.status) === "paid" || row.payload?.payment?.deliveryPaid === true) {
    return row;
  }
  const payload = buildDeliveryPaymentPayload(row, safeFee, paymentExtras);
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
  try {
    await syncCourierJobPricingFromDeliveryRow(updated, { paid: true, paymentExtras });
  } catch (e) {
    console.error("syncCourierJobPricingFromDeliveryRow paid", e);
  }
  if (updated.jobId) {
    try {
      const paymentService = require("./payment.service");
      await paymentService.finalizeCourierDeliveryEscrowAfterPayment(updated.jobId);
    } catch (e) {
      console.error("finalizeCourierDeliveryEscrowAfterPayment", updated.jobId, e);
    }
  }
  await syncMaterialOrderDeliveryFromRow(updated, "pay", {
    fee: safeFee,
    ...paymentExtras,
  });
  return updated;
}

async function payDirectDeliveryRequest(id, customerUserId, fee) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(id) } });
  if (!row) throw new AppError("Delivery request not found", 404);
  if (String(row.customerId) !== String(customerUserId)) throw new AppError("Forbidden", 403);
  if (String(row.status) !== "approved") throw new AppError("Delivery must be approved before payment", 400);
  const safeFee = roundMoney2(Number(fee ?? row.quotedFee ?? 0));
  const updated = await applyDeliveryPayment(row, safeFee, {
    invoiceId: `INV-DEL-${String(id).slice(-8)}-${Date.now()}`,
  });
  return enrichDeliveryRequestAsync(updated);
}

/** Gateway settlement (PaymentIntent DELIVERY_FEE webhook / sandbox return). */
async function settleDeliveryRequestPayment(deliveryRequestId, intent) {
  const row = await prisma.deliveryRequest.findUnique({ where: { id: String(deliveryRequestId) } });
  if (!row) throw new AppError("Delivery request not found", 404);
  if (String(row.status) !== "approved" && String(row.status) !== "paid") {
    throw new AppError("Delivery must be approved before payment", 400);
  }
  const safeFee = roundMoney2(Number(intent.amount ?? row.quotedFee ?? 0));
  const updated = await applyDeliveryPayment(row, safeFee, {
    merchantReference: intent.merchantReference,
    provider: intent.provider,
    gatewayTransactionId: intent.gatewayTransactionId,
    paidAt: intent.paidAt ? new Date(intent.paidAt).toISOString() : new Date().toISOString(),
    invoiceId: `INV-DEL-${intent.merchantReference || intent.id}`,
  });
  return enrichDeliveryRequestAsync(updated);
}

async function syncMaterialOrderFulfillmentFromDeliveryRequest(deliveryRequestRow) {
  const moId = deliveryRequestRow?.materialOrderId ? String(deliveryRequestRow.materialOrderId).trim() : "";
  if (!moId) return;
  try {
    const materialOrderService = require("./materialOrder.service");
    await materialOrderService.syncMaterialOrderFulfillmentFromDeliveryRequest(deliveryRequestRow);
  } catch (e) {
    console.error("syncMaterialOrderFulfillmentFromDeliveryRequest", moId, e);
  }
}

/**
 * After customer confirms receipt and submits a rating on a linked material order,
 * complete the courier child job, release held escrow, and stamp completion metadata.
 */
async function syncCourierDeliveryCustomerCompletion(materialOrderId) {
  const mid = String(materialOrderId || "").trim();
  if (!mid) return null;

  const order = await prisma.materialOrder.findUnique({
    where: { id: mid },
    include: { materialRating: true },
  });
  if (!order) return null;

  const pload = order.payload && typeof order.payload === "object" ? order.payload : {};
  if (String(order.fulfillmentStatus || "") !== "COMPLETED") return null;
  if (!pload.deliveryConfirmed) return null;
  if (!order.materialRating) return null;

  const dr = await prisma.deliveryRequest.findFirst({
    where: { materialOrderId: mid },
  });
  if (!dr?.jobId) return null;

  const { getJobMeta, mutateJobMetaInTransaction } = require("./jobMeta.service");
  const paymentService = require("./payment.service");
  const escrowSettlement = require("./payments/escrowSettlement.service");
  const meta = await getJobMeta(dr.jobId);
  if (!meta?.courierFlow) return null;

  const job = await prisma.job.findUnique({ where: { id: dr.jobId } });
  if (!job) return null;

  const alreadyCompleted =
    String(job.status) === "COMPLETED" && meta.completionConfirmedByUser === true;
  const alreadyFullyReleased = Boolean(job.paymentReleased && job.isFullyReleased);

  if (alreadyCompleted && alreadyFullyReleased) {
    return { jobId: dr.jobId, alreadyCompleted: true };
  }

  const confirmedAt =
    pload.deliveryConfirmedAt || order.materialRating.createdAt.toISOString();
  const ratedAt = order.materialRating.createdAt.toISOString();

  await prisma.$transaction(
    async (tx) => {
      if (!alreadyCompleted) {
        await tx.job.update({
          where: { id: dr.jobId },
          data: { status: "COMPLETED" },
        });
        await mutateJobMetaInTransaction(tx, dr.jobId, (m) => ({
          ...m,
          statusOverride: "COMPLETED",
          completionConfirmedByUser: true,
          progressStep: Math.max(Number(m.progressStep) || 0, 5),
          customerConfirmedAt: confirmedAt,
          deliveryRating: order.materialRating.rating,
          deliveryReview: order.materialRating.comment || null,
        }));

        const drPayload = dr.payload && typeof dr.payload === "object" ? { ...dr.payload } : {};
        drPayload.customerCompletion = {
          confirmedAt,
          ratedAt,
          rating: order.materialRating.rating,
          comment: order.materialRating.comment || null,
        };
        await tx.deliveryRequest.update({
          where: { id: dr.id },
          data: { payload: drPayload },
        });
      }

      if (job.providerId && !alreadyFullyReleased) {
        const providerRow = await tx.provider.findUnique({
          where: { userId: job.providerId },
          select: { id: true },
        });
        if (providerRow) {
          const j0 = await tx.job.findUnique({ where: { id: dr.jobId } });
          if (j0 && !(j0.escrowSecondReleaseDone && j0.paymentReleased)) {
            await paymentService.runSecondTrancheInTransaction(tx, {
              job: j0,
              providerProfileId: providerRow.id,
              jobId: dr.jobId,
            });
            await escrowSettlement.markLaborEscrowFullyReleased(dr.jobId, tx);
          }
        }
      }
    },
    { maxWait: 5000, timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  try {
    const notificationService = require("./notification.service");
    if (dr.courierId) {
      await notificationService.addNotification({
        userId: dr.courierId,
        jobId: dr.jobId,
        type: "delivery_completed",
        title: "Delivery confirmed",
        message: `Customer confirmed delivery and left a ${order.materialRating.rating}-star rating.`,
      });
    }
  } catch (e) {
    console.error("syncCourierDeliveryCustomerCompletion notify", e);
  }

  try {
    if (global.io && dr.courierId) {
      global.io.to(String(dr.courierId)).emit("delivery:customer_completed", {
        jobId: dr.jobId,
        deliveryRequestId: dr.id,
        materialOrderId: mid,
        rating: order.materialRating.rating,
      });
    }
  } catch (e) {
    console.error("syncCourierDeliveryCustomerCompletion socket", e);
  }

  return { jobId: dr.jobId, completed: true };
}

function resolveDeliveryFeeFromRow(row) {
  if (!row) return 0;
  const direct = row.quotedFee != null ? Number(row.quotedFee) : NaN;
  if (Number.isFinite(direct) && direct >= 0) return roundMoney2(direct);
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const fromQuote = Number(payload.deliveryQuote?.fee);
  if (Number.isFinite(fromQuote) && fromQuote >= 0) return roundMoney2(fromQuote);
  const fromDelivery = Number(payload.delivery?.fee);
  if (Number.isFinite(fromDelivery) && fromDelivery >= 0) return roundMoney2(fromDelivery);
  return 0;
}

/**
 * Mirror delivery fee onto the linked courier Job row (price, servicePrice, and settlement fields when paid).
 */
async function syncCourierJobPricingFromDeliveryRow(row, { paid = false, paymentExtras = {} } = {}) {
  if (!row?.jobId) return;
  const { getJobMeta, mutateJobMeta } = require("./jobMeta.service");
  const paymentService = require("./payment.service");

  const meta = await getJobMeta(row.jobId);
  if (!meta?.courierFlow) return;

  const fee = resolveDeliveryFeeFromRow(row);
  if (fee <= 0) return;

  const jobData = {
    price: new Prisma.Decimal(fee.toFixed(2)),
  };
  if (paid) {
    const { commissionAmount, providerAmount } = paymentService.splitLaborTotalGross(
      new Prisma.Decimal(fee.toFixed(2))
    );
    jobData.totalPrice = new Prisma.Decimal(fee.toFixed(2));
    jobData.commissionAmount = commissionAmount;
    jobData.providerAmount = providerAmount;
    jobData.laborPaid = true;
  }

  await prisma.job.update({
    where: { id: String(row.jobId) },
    data: jobData,
  });

  await mutateJobMeta(row.jobId, (m) => ({
    ...m,
    servicePrice: {
      amount: fee,
      note: row.quoteNote ? String(row.quoteNote) : m.servicePrice?.note || "",
      submittedAt: m.servicePrice?.submittedAt || new Date().toISOString(),
    },
    ...(paid
      ? {
          laborPaid: true,
          servicePayment: {
            status: "paid",
            amount: fee,
            paidAt: paymentExtras.paidAt || new Date().toISOString(),
            paidBy: row.customerId || m.servicePayment?.paidBy || null,
            channel: paymentExtras.provider ? String(paymentExtras.provider) : "delivery",
            paymentRef:
              paymentExtras.merchantReference ||
              paymentExtras.gatewayTransactionId ||
              m.servicePayment?.paymentRef ||
              null,
            maskedPaymentMethod: "**** **** **** ****",
          },
        }
      : {}),
  }));
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
  if (!isDeliveryRequestPaidForFulfillment(row)) {
    throw new AppError("Delivery must be paid before fulfillment updates", 400);
  }
  let current = String(row.fulfillmentStatus || "READY").toUpperCase();
  if (current === "PENDING" && isDeliveryRequestPaidForFulfillment(row)) {
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
  if (global.io) {
    global.io.to(String(updated.id)).emit("delivery-request:updated", {
      deliveryRequestId: updated.id,
      fulfillmentStatus: next,
      courierPhase: payload.courierPhase,
    });
  }
  if (next === "COMPLETED" && updated.materialOrderId) {
    try {
      const materialOrderService = require("./materialOrder.service");
      await materialOrderService.syncMaterialOrderFulfillmentFromDeliveryRequest(updated);
    } catch (e) {
      console.error("syncMaterialOrderFulfillmentFromDeliveryRequest", e);
    }
  }
  return enrichDeliveryRequestAsync(updated);
}

async function syncMaterialOrderDeliveryFromRow(row, action, extra = {}) {
  const moId = row?.materialOrderId ? String(row.materialOrderId).trim() : "";
  if (!moId) return;
  if (action !== "pay" && !row?.courierId) return;
  try {
    const materialOrderService = require("./materialOrder.service");
    if (action === "quote") {
      await materialOrderService.submitDeliveryQuote(moId, row.courierId, {
        fee: extra.fee,
        note: extra.note,
      });
    } else if (action === "reject") {
      await materialOrderService.rejectDeliveryRequestByProvider(moId, row.courierId, extra.reason);
    } else if (action === "pay") {
      await materialOrderService.markMaterialOrderDeliveryPaid(moId, {
        fee: extra.fee,
        merchantReference: extra.merchantReference,
        provider: extra.provider,
        gatewayTransactionId: extra.gatewayTransactionId,
        paidAt: extra.paidAt,
        invoiceId: extra.invoiceId,
        reconcileFromDeliveryRequest: true,
      });
    }
  } catch (e) {
    console.error("syncMaterialOrderDeliveryFromRow", action, moId, e);
  }
}

/**
 * Resolve the courier child job id for a material order (DR link, parent storeOrders meta, job meta).
 */
async function resolveCourierJobIdForMaterialOrder(materialOrderId, hints = {}) {
  const mid = String(materialOrderId || "").trim();
  if (!mid) return "";

  const hinted = hints.courierJobId ? String(hints.courierJobId).trim() : "";
  if (hinted) return hinted;

  const dr = await prisma.deliveryRequest.findFirst({
    where: { materialOrderId: mid },
    orderBy: { createdAt: "desc" },
    select: { jobId: true },
  });
  if (dr?.jobId) return String(dr.jobId);

  const mo = await prisma.materialOrder.findUnique({
    where: { id: mid },
    select: { jobId: true },
  });
  if (mo?.jobId) {
    const { getJobMeta } = require("./jobMeta.service");
    const meta = await getJobMeta(mo.jobId);
    const storeOrder = Array.isArray(meta?.storeOrders)
      ? meta.storeOrders.find((o) => String(o.orderId) === mid)
      : null;
    if (storeOrder?.courierJobId) return String(storeOrder.courierJobId);
  }

  const metaMatch = await prisma.job.findFirst({
    where: {
      status: { not: "CANCELLED" },
      meta: { path: ["materialOrderId"], equals: mid },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (metaMatch?.id) return String(metaMatch.id);

  return "";
}

/**
 * Cancel a material courier child job when the customer cancels delivery or switches provider.
 * Old courier sees the job in their Canceled requests inbox.
 */
async function cancelCourierDeliveryForCustomer(params = {}) {
  const {
    materialOrderId,
    courierJobId,
    source = "customer_cancel",
    resetDeliveryRequest = false,
    notify = true,
  } = params;

  let dr = null;
  let jobId = courierJobId ? String(courierJobId).trim() : "";

  if (materialOrderId) {
    dr = await prisma.deliveryRequest.findFirst({
      where: { materialOrderId: String(materialOrderId) },
      orderBy: { createdAt: "desc" },
    });
    if (dr?.jobId) jobId = String(dr.jobId);
    if (!jobId) {
      jobId = await resolveCourierJobIdForMaterialOrder(materialOrderId, { courierJobId });
    }
  } else if (jobId) {
    dr = await prisma.deliveryRequest.findFirst({ where: { jobId } });
  }

  if (!jobId) return { cancelled: false };

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || String(job.status) === "CANCELLED") {
    return { cancelled: false, courierJobId: jobId, deliveryRequestId: dr?.id };
  }

  const cancelledAt = new Date().toISOString();
  const cancellationReason =
    source === "customer_changed_provider"
      ? "Customer chose another courier"
      : source === "customer_changed_delivery_option"
        ? "Customer changed delivery option"
        : "Customer cancelled delivery";

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "CANCELLED" },
  });

  const { mutateJobMeta } = require("./jobMeta.service");
  await mutateJobMeta(jobId, (m) => ({
    ...m,
    statusOverride: "CANCELLED",
    cancellationSource: source,
    cancelledAt,
    cancelledBy: "customer",
    cancellationReason,
  }));

  if (dr) {
    if (resetDeliveryRequest) {
      await prisma.deliveryRequest.update({
        where: { id: dr.id },
        data: {
          status: "pending_quote",
          jobId: null,
          fulfillmentStatus: MaterialFulfillmentStatus.PENDING,
          quotedFee: null,
          quoteNote: null,
          payload: {
            payment: { deliveryPaid: false },
            delivery: { status: "PendingApproval", fee: 0 },
          },
        },
      });
    } else {
      const payload = dr.payload && typeof dr.payload === "object" ? { ...dr.payload } : {};
      payload.delivery = { ...(payload.delivery || {}), status: "Cancelled" };
      await prisma.deliveryRequest.update({
        where: { id: dr.id },
        data: { status: "cancelled", payload },
      });
    }
  }

  if (notify && job.providerId) {
    try {
      await notificationEvents.notifyDeliveryUpdate(
        job.providerId,
        jobId,
        job.title || "Delivery request",
        cancellationReason
      );
    } catch (e) {
      console.error("cancelCourierDeliveryForCustomer notify", e);
    }
  }

  return { cancelled: true, courierJobId: jobId, deliveryRequestId: dr?.id };
}

async function createCourierJobForDeliveryRequest(dr, params) {
  const {
    parentJobId,
    materialOrderId,
    courierUserId,
    customerUserId,
    collectionPoint,
    destinationPoint,
    items = [],
    storeName = "Store",
    parentJobTitle = "",
  } = params;

  const mid = String(materialOrderId || "").trim();
  const pid = String(parentJobId || "").trim();
  const cid = String(customerUserId || "").trim();
  const courierId = String(courierUserId || dr.courierId || "").trim();
  const collection = buildGeoPoint(collectionPoint || dr.collectionPoint || {});
  const destination = buildGeoPoint(destinationPoint || dr.destinationPoint || {});
  const deliveryItems = Array.isArray(items) && items.length > 0 ? items : dr.items;

  const parentJob = await prisma.job.findUnique({
    where: { id: pid },
    select: { title: true },
  });
  const title = parentJob?.title || parentJobTitle || "Service job";
  const storeLabel = String(storeName || "Store").trim();
  const description =
    dr.description ||
    `Collect materials from ${storeLabel} and deliver to the job site for: ${title}.`;

  const jobMeta = createDefaultJobMeta();
  jobMeta.courierFlow = true;
  jobMeta.deliveryRequestId = dr.id;
  jobMeta.materialOrderId = mid;
  jobMeta.parentJobId = pid;
  jobMeta.source = "job_materials";

  const job = await prisma.job.create({
    data: {
      title: `Material delivery — ${storeLabel}`,
      category: "delivery",
      location: destination.city || destination.address || "UNKNOWN",
      locationDetails: {
        address: destination.address,
        city: destination.city,
        area: destination.area,
        suburb: destination.suburb,
        coordinates: destination.coordinates,
        collection,
        destination,
      },
      description,
      price: 0,
      images: [],
      measurements: {
        source: "MANUAL",
        values: {},
        deliveryItems,
        collectionPoint: collection,
        destinationPoint: destination,
      },
      materials: [],
      customerId: cid,
      providerId: courierId,
      status: "PENDING",
      meta: jobMeta,
    },
  });

  await prisma.deliveryRequest.update({
    where: { id: dr.id },
    data: { jobId: job.id, courierId },
  });

  try {
    await notificationEvents.notifyCourierDeliveryRequest(courierId, dr.id);
    await notificationEvents.notifyJobRequest(courierId, job.id, `Material delivery — ${storeLabel}`);
  } catch (e) {
    console.error("createCourierJobForDeliveryRequest notify", e);
  }

  return { courierJobId: job.id, deliveryRequestId: dr.id };
}

/**
 * Flow-2 material courier: create a dedicated pending Job + DeliveryRequest (same as standalone delivery)
 * so the courier sees a normal RequestCard via GET /jobs/match — not only MaterialOrder inbox.
 */
async function ensureMaterialCourierJobRequest(params) {
  const {
    parentJobId,
    materialOrderId,
    courierUserId,
    customerUserId,
    collectionPoint,
    destinationPoint,
    items = [],
    storeName = "Store",
    parentJobTitle = "",
  } = params;

  const mid = String(materialOrderId || "").trim();
  const pid = String(parentJobId || "").trim();
  const cid = String(customerUserId || "").trim();
  if (!mid || !pid || !cid || !courierUserId) {
    throw new AppError("parentJobId, materialOrderId, customerUserId and courier are required", 400);
  }

  const materialOrderService = require("./materialOrder.service");
  const courierId = await materialOrderService.resolveCourierUserId(courierUserId);
  if (!courierId) throw new AppError("Delivery provider not found", 400);

  const collection = buildGeoPoint(collectionPoint || {});
  const destination = buildGeoPoint(destinationPoint || {});
  if (!collection.address) throw new AppError("Collection address is required for material delivery", 400);
  if (!destination.address) throw new AppError("Destination address is required for material delivery", 400);
  assertDistinctAddresses(collection, destination);

  const deliveryItems = Array.isArray(items)
    ? items.map((i) => ({
        name: String(i.name || "Material"),
        qty: Number(i.qty) || 1,
        weight: Number(i.weight) || 0,
      }))
    : [{ name: "Materials", qty: 1, weight: 0 }];

  let existingDr = await prisma.deliveryRequest.findFirst({
    where: { materialOrderId: mid },
  });

  const drStatusLower = String(existingDr?.status || "").toLowerCase();
  const drActive =
    existingDr && !["cancelled", "rejected"].includes(drStatusLower);
  const existingJob = existingDr?.jobId
    ? await prisma.job.findUnique({ where: { id: String(existingDr.jobId) } })
    : null;
  const jobActive = Boolean(existingJob && String(existingJob.status) !== "CANCELLED");
  const courierChanged =
    existingDr?.courierId && String(existingDr.courierId) !== String(courierId);
  const isStaleDr = existingDr && !(jobActive && drActive);

  if (existingDr && jobActive && drActive && courierChanged) {
    await cancelCourierDeliveryForCustomer({
      materialOrderId: mid,
      source: "customer_changed_provider",
      resetDeliveryRequest: true,
      notify: true,
    });
    existingDr = await prisma.deliveryRequest.findFirst({ where: { materialOrderId: mid } });
    await prisma.deliveryRequest.update({
      where: { id: existingDr.id },
      data: {
        courierId,
        collectionPoint: collection,
        destinationPoint: destination,
        items: deliveryItems,
        payload: {
          payment: { deliveryPaid: false },
          delivery: { status: "PendingApproval", providerId: courierId, fee: 0 },
        },
      },
    });
    return createCourierJobForDeliveryRequest(existingDr, params);
  }

  if (existingDr && jobActive && drActive) {
    const courierJobId = String(existingDr.jobId);
    await prisma.job.update({
      where: { id: courierJobId },
      data: { providerId: courierId, status: "PENDING" },
    });
    await prisma.deliveryRequest.update({
      where: { id: existingDr.id },
      data: {
        courierId,
        collectionPoint: collection,
        destinationPoint: destination,
        items: deliveryItems,
      },
    });
    const { mutateJobMeta } = require("./jobMeta.service");
    await mutateJobMeta(courierJobId, (m) => ({
      ...m,
      courierFlow: true,
      deliveryRequestId: existingDr.id,
      materialOrderId: mid,
      parentJobId: pid,
      source: "job_materials",
    }));
    return { courierJobId, deliveryRequestId: existingDr.id };
  }

  if (isStaleDr) {
    await prisma.deliveryRequest.update({
      where: { id: existingDr.id },
      data: {
        jobId: null,
        courierId,
        collectionPoint: collection,
        destinationPoint: destination,
        items: deliveryItems,
        status: "pending_quote",
        fulfillmentStatus: MaterialFulfillmentStatus.PENDING,
        quotedFee: null,
        quoteNote: null,
        payload: {
          payment: { deliveryPaid: false },
          delivery: { status: "PendingApproval", providerId: courierId, fee: 0 },
        },
      },
    });
    existingDr = await prisma.deliveryRequest.findFirst({ where: { materialOrderId: mid } });
    return createCourierJobForDeliveryRequest(existingDr, params);
  }

  const parentJob = await prisma.job.findUnique({
    where: { id: pid },
    select: { title: true },
  });
  const title = parentJob?.title || parentJobTitle || "Service job";
  const storeLabel = String(storeName || "Store").trim();
  const description = `Collect materials from ${storeLabel} and deliver to the job site for: ${title}.`;

  const { courierJobId, deliveryRequestId } = await prisma.$transaction(async (tx) => {
    const dr = await tx.deliveryRequest.create({
      data: {
        customerId: cid,
        courierId,
        source: "job_materials",
        materialOrderId: mid,
        category: "delivery",
        description,
        items: deliveryItems,
        collectionPoint: collection,
        destinationPoint: destination,
        status: "pending_quote",
        fulfillmentStatus: "PENDING",
        payload: {
          payment: { deliveryPaid: false },
          delivery: { status: "PendingApproval", providerId: courierId, fee: 0 },
        },
      },
    });

    const jobMeta = createDefaultJobMeta();
    jobMeta.courierFlow = true;
    jobMeta.deliveryRequestId = dr.id;
    jobMeta.materialOrderId = mid;
    jobMeta.parentJobId = pid;
    jobMeta.source = "job_materials";

    const job = await tx.job.create({
      data: {
        title: `Material delivery — ${storeLabel}`,
        category: "delivery",
        location: destination.city || destination.address || "UNKNOWN",
        locationDetails: {
          address: destination.address,
          city: destination.city,
          area: destination.area,
          suburb: destination.suburb,
          coordinates: destination.coordinates,
          collection,
          destination,
        },
        description,
        price: 0,
        images: [],
        measurements: {
          source: "MANUAL",
          values: {},
          deliveryItems,
          collectionPoint: collection,
          destinationPoint: destination,
        },
        materials: [],
        customerId: cid,
        providerId: courierId,
        status: "PENDING",
        meta: jobMeta,
      },
    });

    await tx.deliveryRequest.update({
      where: { id: dr.id },
      data: { jobId: job.id },
    });

    return { courierJobId: job.id, deliveryRequestId: dr.id };
  });

  try {
    await notificationEvents.notifyCourierDeliveryRequest(courierId, deliveryRequestId);
    await notificationEvents.notifyJobRequest(
      courierId,
      courierJobId,
      `Material delivery — ${storeLabel}`
    );
  } catch (e) {
    console.error("ensureMaterialCourierJobRequest notify", e);
  }

  return { courierJobId, deliveryRequestId };
}

module.exports = {
  createDeliveryRequest,
  resolveCourierJobIdForMaterialOrder,
  cancelCourierDeliveryForCustomer,
  ensureMaterialCourierJobRequest,
  listDeliveryRequestsForCustomer,
  listDirectDeliveryInboxForCourier,
  getDeliveryRequestById,
  getDeliveryRequestByJobId,
  submitDirectDeliveryQuote,
  rejectDirectDeliveryRequest,
  acceptDirectDeliveryQuote,
  payDirectDeliveryRequest,
  settleDeliveryRequestPayment,
  updateDirectDeliveryFulfillment,
  rejectDeliveryRequestsForJob,
  enrichDeliveryRequest,
  enrichDeliveryRequestAsync,
  syncMaterialOrderDeliveryFromRow,
  syncDeliveryRequestApprovedFromMaterialOrder,
  syncCourierDeliveryCustomerCompletion,
  syncCourierJobPricingFromDeliveryRow,
  resolveDeliveryFeeFromRow,
  assertDistinctAddresses,
};
