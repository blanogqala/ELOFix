const prisma = require("../config/prisma");
const AppError = require("./AppError");
const paymentService = require("../services/payment.service");

const EN_ROUTE_COURIER_FULFILLMENT = new Set([
  "COLLECTING",
  "COLLECTED",
  "OUT_FOR_DELIVERY",
  "AT_DESTINATION",
]);

/** Courier jobs cannot be cancelled once items are picked up (COLLECTED+). */
const COURIER_POST_PICKUP_FULFILLMENT = new Set([
  "COLLECTED",
  "OUT_FOR_DELIVERY",
  "AT_DESTINATION",
  "COMPLETED",
]);

function getCourierCancellationBlockedMessage(actor) {
  if (actor === "provider") {
    return "You cannot cancel after picking up items.";
  }
  return "This delivery cannot be cancelled after items have been collected.";
}

/**
 * Hard-block courier cancellation after pickup or when awaiting customer confirmation.
 */
async function assertCourierCancellationAllowed(job, meta, actorRole) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  if (!safeMeta.courierFlow) return;

  const actor = mapActorRole(actorRole);
  if (!actor || actor === "admin") return;

  const frontendStatus = String(safeMeta.statusOverride || job.status || "").toUpperCase();
  if (frontendStatus === "AWAITING_CONFIRMATION") {
    throw new AppError(getCourierCancellationBlockedMessage(actor), 409);
  }

  const dr = await prisma.deliveryRequest.findFirst({
    where: { jobId: String(job.id) },
    select: { fulfillmentStatus: true },
  });
  if (!dr) return;

  const fs = String(dr.fulfillmentStatus || "").toUpperCase();
  if (COURIER_POST_PICKUP_FULFILLMENT.has(fs)) {
    throw new AppError(getCourierCancellationBlockedMessage(actor), 409);
  }
}

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

const ADMIN_PAYMENT_CANCEL_BLOCKED_MSG =
  "This job cannot be cancelled while an outstanding admin-required payment is due.";
const ADMIN_PAYMENT_MARK_COMPLETE_BLOCKED_MSG =
  "Cannot mark complete while an outstanding admin-required payment is due.";

async function assertNoBlockingAdminCompletionPayment(
  job,
  meta,
  message = ADMIN_PAYMENT_CANCEL_BLOCKED_MSG
) {
  const obligationService = require("../services/customerPaymentObligation.service");
  const open = await obligationService.getOpenObligationForJob(job.id);
  if (open && String(open.source || "").toUpperCase() === "ADMIN_RELEASE") {
    throw new AppError(message, 400);
  }

  const due = meta?.completionPaymentDue;
  if (due && typeof due === "object" && due.resolutionLogId) {
    const amountDue = Number(due.amountDue) || 0;
    if (amountDue > 0) {
      throw new AppError(message, 400);
    }
  }
}

async function assertAdminRequiredPaymentAllowsCancel(job, meta) {
  return assertNoBlockingAdminCompletionPayment(job, meta, ADMIN_PAYMENT_CANCEL_BLOCKED_MSG);
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

  await assertAdminRequiredPaymentAllowsCancel(job, meta);

  await assertCourierCancellationAllowed(job, meta, actorRole);

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
  COURIER_POST_PICKUP_FULFILLMENT,
  ADMIN_PAYMENT_CANCEL_BLOCKED_MSG,
  ADMIN_PAYMENT_MARK_COMPLETE_BLOCKED_MSG,
  assertCourierCancellationAllowed,
  assertNoBlockingAdminCompletionPayment,
  assertAdminRequiredPaymentAllowsCancel,
  getCourierCancellationBlockedMessage,
  isLaborPaid,
  isProviderEnRouteToService,
  resolveJobCancellationPolicy,
};
