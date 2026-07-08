const prisma = require("../config/prisma");
const AppError = require("./AppError");
const paymentService = require("../services/payment.service");

const EN_ROUTE_COURIER_FULFILLMENT = new Set([
  "COLLECTING",
  "COLLECTED",
  "OUT_FOR_DELIVERY",
  "AT_DESTINATION",
]);

/**
 * Provider has left for pickup / active service is underway (cancellation penalties may apply).
 */
async function isProviderEnRouteToService(job, meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  if (safeMeta.courierFlow) {
    const dr = await prisma.deliveryRequest.findFirst({
      where: { jobId: String(job.id) },
      select: { fulfillmentStatus: true, status: true },
    });
    if (!dr) return false;
    const fs = String(dr.fulfillmentStatus || "").toUpperCase();
    if (EN_ROUTE_COURIER_FULFILLMENT.has(fs)) return true;
    return false;
  }
  const frontendStatus = safeMeta.statusOverride || job.status;
  const s = String(frontendStatus || "").toUpperCase();
  return s === "IN_PROGRESS" || s === "AWAITING_CONFIRMATION";
}

function isLaborPaid(job, meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  return Boolean(job?.laborPaid) || Boolean(safeMeta.laborPaid);
}

function mapActorRole(role) {
  const r = String(role || "").toUpperCase();
  if (r === "CUSTOMER" || r === "USER") return "customer";
  if (r === "PROVIDER") return "provider";
  if (r === "ADMIN") return "admin";
  return null;
}

/**
 * Resolve who is cancelling and what refund applies before the job is marked cancelled.
 */
async function resolveJobCancellationPolicy(job, meta, actorUserId, actorRole) {
  const actor = mapActorRole(actorRole);
  if (!actor) {
    throw new AppError("Forbidden", 403);
  }

  const frontendStatus = meta?.statusOverride || job.status;
  if (String(frontendStatus) === "CANCELLED") {
    throw new AppError("Job is already cancelled", 400);
  }
  if (String(frontendStatus) === "COMPLETED") {
    throw new AppError("Completed jobs cannot be cancelled", 400);
  }

  if (actor === "customer" && String(job.customerId) !== String(actorUserId)) {
    throw new AppError("Forbidden", 403);
  }
  if (actor === "provider" && String(job.providerId) !== String(actorUserId)) {
    throw new AppError("Forbidden", 403);
  }

  const providerEnRoute = await isProviderEnRouteToService(job, meta);
  const laborPaid = isLaborPaid(job, meta);

  let refundAmount = 0;
  let refundKind = laborPaid ? "standard" : "none";
  let customerForfeits = false;
  let opensDisputeReview = false;

  if (!laborPaid) {
    return {
      cancelledBy: actor,
      providerEnRoute,
      refundAmount: 0,
      refundKind: "none",
      customerForfeits: false,
      opensDisputeReview: false,
      laborPaid: false,
    };
  }

  if (actor === "customer" && providerEnRoute && meta?.courierFlow) {
    refundAmount = 0;
    refundKind = "forfeit_customer_en_route";
    customerForfeits = true;
    return {
      cancelledBy: actor,
      providerEnRoute,
      refundAmount,
      refundKind,
      customerForfeits,
      opensDisputeReview: false,
      laborPaid: true,
    };
  }

  opensDisputeReview = true;
  refundAmount = 0;
  refundKind = "dispute_review_pending";

  return {
    cancelledBy: actor,
    providerEnRoute,
    refundAmount,
    refundKind,
    customerForfeits: false,
    opensDisputeReview,
    laborPaid: true,
  };
}

module.exports = {
  EN_ROUTE_COURIER_FULFILLMENT,
  isLaborPaid,
  isProviderEnRouteToService,
  resolveJobCancellationPolicy,
};
