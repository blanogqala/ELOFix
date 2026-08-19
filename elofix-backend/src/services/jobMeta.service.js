const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const {
  normalizeTimelineEvents,
  hasTimelineEventType,
  appendTimelineEventIfAbsent,
} = require("../utils/jobTimeline.util");
const { toFrontendStatus } = require("../utils/jobStatus.util");

function createDefaultJobMeta() {
  return {
    statusOverride: null,
    jobNotes: [],
    chat: [],
    laborPaid: false,
    servicePrice: null,
    servicePayment: null,
    escrow: { heldAmount: 0, releasedAmount: 0 },
    providerAdjustedRequirements: null,
    userMaterialSuggestions: [],
    providerSuggestions: [],
    materialPayments: [],
    storeOrders: [],
    proposedLaborPrice: null,
    completionConfirmedByUser: false,
    userRating: null,
    userReview: null,
    cancellationReason: null,
    cancellationDetails: null,
    cancelledAt: null,
    rejectionReason: null,
    rejectionDetails: null,
    rejectedAt: null,
    rejectedByProviderUserId: null,
    progressStep: 0,
    /** Once true (first service or material batch paid), timeline never returns to payment step. */
    hasStarted: false,
    timelineEvents: [],
  };
}

function dedupeJobStoreOrders(storeOrders) {
  const seen = new Set();
  return (Array.isArray(storeOrders) ? storeOrders : []).filter((o) => {
    const id = String(o.orderId || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Sticky + payment-derived: used in API and must match jobProgress.util derive. */
function resolveJobHasStarted(meta, job) {
  const safe = normalizeMeta(meta);
  if (safe.hasStarted === true) return true;
  if (Boolean(job.laborPaid) || Boolean(safe.laborPaid)) return true;
  const mps = Array.isArray(safe.materialPayments) ? safe.materialPayments : [];
  if (mps.some((p) => String(p.status || "").toLowerCase() === "paid")) return true;
  const orders = dedupeJobStoreOrders(safe.storeOrders);
  if (orders.some((o) => o.payment && o.payment.materialsPaid === true)) return true;
  return false;
}

function normalizeMeta(meta) {
  const base = createDefaultJobMeta();
  const merged = { ...base, ...(meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {}) };
  const esc = merged.escrow && typeof merged.escrow === "object" ? merged.escrow : {};
  merged.escrow = {
    heldAmount: Number(esc.heldAmount) || 0,
    releasedAmount: Number(esc.releasedAmount) || 0,
  };
  let ps = Number(merged.progressStep);
  if (!Number.isFinite(ps) || ps < 0) ps = 0;
  merged.progressStep = ps;
  merged.hasStarted = merged.hasStarted === true;
  merged.timelineEvents = normalizeTimelineEvents(merged.timelineEvents);
  return merged;
}

function stripJobForApi(job) {
  if (!job || typeof job !== "object") return job;
  const { meta: _omit, providerReview: _pr, ...rest } = job;
  return rest;
}

/**
 * Serializable transaction + single-row update prevents lost updates when multiple requests
 * mutate the same job meta concurrently.
 */
async function mutateJobMeta(jobId, mutator) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.job.findUnique({
        where: { id: jobId },
        select: { id: true, meta: true },
      });
      if (!row) {
        throw new AppError("Job not found", 404);
      }
      const current = normalizeMeta(row.meta);
      const rawNext = mutator(current);
      const nextMeta = normalizeMeta(rawNext !== undefined && rawNext !== null ? rawNext : current);
      await tx.job.update({
        where: { id: jobId },
        data: { meta: nextMeta },
      });
      return nextMeta;
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}

/**
 * Same as mutateJobMeta but uses an existing interactive transaction (no nested transaction).
 */
async function mutateJobMetaInTransaction(tx, jobId, mutator) {
  const row = await tx.job.findUnique({
    where: { id: jobId },
    select: { id: true, meta: true },
  });
  if (!row) {
    throw new AppError("Job not found", 404);
  }
  const current = normalizeMeta(row.meta);
  const rawNext = mutator(current);
  const nextMeta = normalizeMeta(rawNext !== undefined && rawNext !== null ? rawNext : current);
  await tx.job.update({
    where: { id: jobId },
    data: { meta: nextMeta },
  });
  return nextMeta;
}

async function setJobMeta(jobId, patch) {
  return mutateJobMeta(jobId, (current) => ({ ...current, ...(patch || {}) }));
}

async function getJobMeta(jobId) {
  const row = await prisma.job.findUnique({
    where: { id: jobId },
    select: { meta: true },
  });
  return normalizeMeta(row?.meta);
}

/** Completed jobs must never surface a stale in-progress override. */
function isTerminalJobState(meta, jobRow) {
  const safe = normalizeMeta(meta);
  if (String(jobRow?.status) === "COMPLETED") return true;
  if (safe.completionConfirmedByUser === true) return true;
  if (safe.statusOverride === "COMPLETED") return true;
  return false;
}

function resolvePaymentSettlementStatus(job, safeMeta) {
  const refundStatus = String(safeMeta.refund?.status || "").toLowerCase();
  const refundAmount =
    safeMeta.refund?.cumulativeCustomerNet != null && Number.isFinite(Number(safeMeta.refund.cumulativeCustomerNet))
      ? Number(safeMeta.refund.cumulativeCustomerNet)
      : safeMeta.refund?.amount != null && Number.isFinite(Number(safeMeta.refund.amount))
        ? Number(safeMeta.refund.amount)
        : 0;
  const isCancelled =
    String(job?.status || "").toUpperCase() === "CANCELLED" ||
    String(safeMeta.statusOverride || "").toUpperCase() === "CANCELLED";
  const isCancelRefund =
    String(safeMeta.refund?.reason || "").toLowerCase() === "cancel" || isCancelled;

  if (refundStatus === "forfeited") {
    // Customer forfeited service payment — not a refund settlement.
  } else if (
    refundStatus === "processed" ||
    refundStatus === "partial" ||
    refundStatus === "gateway_failed" ||
    refundStatus === "recorded" ||
    refundStatus === "pending_manual_gateway" ||
    (refundAmount > 0 && isCancelRefund)
  ) {
    return "refund";
  }
  if (safeMeta.paymentSettlementStatus === "refund") return "refund";
  const held = Number(safeMeta.escrow?.heldAmount) || 0;
  const paymentReleased = typeof job.paymentReleased === "boolean" ? job.paymentReleased : false;
  const isFullyReleased = typeof job.isFullyReleased === "boolean" ? job.isFullyReleased : false;
  if (paymentReleased || isFullyReleased) return "released";
  if (held > 0) return "held";
  return "pending";
}

/**
 * Provider-entitled unreleased share for earnings display.
 * Courier/delivery/moving: full providerAmount (93%) stays held until customer confirms,
 * so remaining equals held escrow (or providerAmount − released) the same as labor.
 */
function computeProviderEntitledRemaining(job, meta) {
  const safeMeta = normalizeMeta(meta);
  const provNum = job.providerAmount != null ? Number(job.providerAmount) : null;
  if (provNum == null || Number.isNaN(provNum)) {
    return 0;
  }
  const relToProvider =
    job.releasedAmount != null && !Number.isNaN(Number(job.releasedAmount))
      ? Number(job.releasedAmount)
      : 0;
  if (safeMeta.escrow?.heldAmount != null && Number.isFinite(Number(safeMeta.escrow.heldAmount))) {
    return Math.max(0, Number(safeMeta.escrow.heldAmount));
  }
  return Math.max(0, provNum - relToProvider);
}

function enrichJob(job, meta) {
  const safeMeta = normalizeMeta(meta);
  const status = toFrontendStatus(job.status, safeMeta);
  const held = safeMeta.escrow?.heldAmount ?? 0;
  const released = safeMeta.escrow?.releasedAmount ?? 0;
  const remainingAmount = computeProviderEntitledRemaining(job, safeMeta);
  const { paidAmountFromJob } = require("../utils/jobPaidAmount.util");
  const customerPaidTotal = paidAmountFromJob({ ...job, meta: safeMeta });
  const paymentModeService = require("./payments/paymentMode.service");
  const paymentSchedule = paymentModeService.serializePaymentSchedule(job);
  const nextLaborPaymentType = job.legacyEscrowV2
    ? null
    : paymentModeService.resolveNextLaborPaymentType(job, safeMeta);
  const paymentSummary = job.legacyEscrowV2
    ? null
    : paymentModeService.buildPaymentSummary(job, safeMeta);

  const pr = job.providerReview || null;
  const jobReview = pr
    ? {
        id: pr.id,
        rating: Number(pr.rating),
        comment: pr.comment || "",
        images: Array.isArray(pr.images) ? pr.images : [],
        videos: Array.isArray(pr.videos) ? pr.videos : [],
        createdAt:
          pr.createdAt instanceof Date ? pr.createdAt.toISOString() : pr.createdAt
            ? String(pr.createdAt)
            : null,
      }
    : null;
  const userRating =
    jobReview?.rating != null
      ? jobReview.rating
      : safeMeta.userRating != null
        ? Number(safeMeta.userRating)
        : null;
  const userReview =
    jobReview?.comment != null && String(jobReview.comment).trim() !== ""
      ? jobReview.comment
      : safeMeta.userReview;

  return {
    ...stripJobForApi(job),
    status,
    totalPrice: job.totalPrice != null ? Number(job.totalPrice) : null,
    providerAmount: job.providerAmount != null ? Number(job.providerAmount) : null,
    commissionAmount: job.commissionAmount != null ? Number(job.commissionAmount) : null,
    releasedAmount: job.releasedAmount != null ? Number(job.releasedAmount) : null,
    remainingAmount: job.legacyEscrowV2 ? remainingAmount : 0,
    customerPaidTotal,
    isFullyReleased: typeof job.isFullyReleased === "boolean" ? job.isFullyReleased : false,
    escrowSecondReleaseDone:
      typeof job.escrowSecondReleaseDone === "boolean" ? job.escrowSecondReleaseDone : false,
    legacyEscrowV2: Boolean(job.legacyEscrowV2),
    paymentModeSnapshot: job.paymentModeSnapshot || null,
    quotedAmount: job.quotedAmount != null ? Number(job.quotedAmount) : null,
    firstPaymentAmount: job.firstPaymentAmount != null ? Number(job.firstPaymentAmount) : null,
    secondPaymentAmount: job.secondPaymentAmount != null ? Number(job.secondPaymentAmount) : null,
    paymentProgress: job.paymentProgress || "NONE",
    paymentSchedule,
    paymentSummary,
    nextLaborPaymentType,
    depositPayment: safeMeta.depositPayment || null,
    completionPayment: safeMeta.completionPayment || null,
    escrow: {
      enabled: Boolean(job.legacyEscrowV2),
      holdPercent: 0,
      heldAmount: job.legacyEscrowV2 ? held : 0,
      releasedAmount: job.legacyEscrowV2 ? released : Number(job.releasedAmount || 0),
    },
    jobNotes: safeMeta.jobNotes,
    chat: safeMeta.chat,
    laborPaid: Boolean(job.laborPaid) || Boolean(safeMeta.laborPaid),
    paymentReleased: typeof job.paymentReleased === "boolean" ? job.paymentReleased : false,
    servicePrice: safeMeta.servicePrice,
    quotationFileUrl: job.quotationFileUrl || null,
    quotationFileName: job.quotationFileName || null,
    quotationUploadedAt: job.quotationUploadedAt
      ? new Date(job.quotationUploadedAt).toISOString()
      : null,
    servicePayment: safeMeta.servicePayment,
    providerAdjustedRequirements: safeMeta.providerAdjustedRequirements,
    userMaterialSuggestions: safeMeta.userMaterialSuggestions,
    providerSuggestions: safeMeta.providerSuggestions,
    materialPayments: safeMeta.materialPayments,
    storeOrders: safeMeta.storeOrders,
    proposedLaborPrice: safeMeta.proposedLaborPrice,
    completionConfirmedByUser: Boolean(safeMeta.completionConfirmedByUser),
    userRating,
    userReview,
    jobReview,
    cancellationReason: safeMeta.cancellationReason,
    cancellationDetails: safeMeta.cancellationDetails,
    cancelledBy: safeMeta.cancelledBy || null,
    cancellationSource: safeMeta.cancellationSource || null,
    cancelledAt: safeMeta.cancelledAt,
    cancelledAtStatus: safeMeta.cancelledAtStatus || null,
    refundAmount:
      safeMeta.refund?.cumulativeCustomerNet != null &&
      Number.isFinite(Number(safeMeta.refund.cumulativeCustomerNet))
        ? Number(safeMeta.refund.cumulativeCustomerNet)
        : safeMeta.refund?.amount != null && Number.isFinite(Number(safeMeta.refund.amount))
          ? Number(safeMeta.refund.amount)
          : undefined,
    refundStatus: safeMeta.refund?.status || safeMeta.refund?.kind || undefined,
    customerRefundStatus: safeMeta.refund?.customerRefundStatus || undefined,
    refundCompletedAt: safeMeta.refund?.completedAt || null,
    providerRefundDebt:
      safeMeta.refund?.providerDebtAdded != null &&
      Number.isFinite(Number(safeMeta.refund.providerDebtAdded))
        ? Number(safeMeta.refund.providerDebtAdded)
        : undefined,
    refundDetails:
      safeMeta.refund && typeof safeMeta.refund === "object"
        ? {
            customerNet: Number(safeMeta.refund.customerNet) || 0,
            materialsNet: Number(safeMeta.refund.materialsNet) || 0,
            escrowApplied: Number(safeMeta.refund.escrowApplied) || 0,
            clawbackApplied: Number(safeMeta.refund.clawbackApplied) || 0,
            providerDebtAdded: Number(safeMeta.refund.providerDebtAdded) || 0,
            immediateRefund: Number(safeMeta.refund.immediateRefund) || 0,
            pendingRefund: Number(safeMeta.refund.pendingRefund) || 0,
            cumulativeCustomerNet: Number(safeMeta.refund.cumulativeCustomerNet) || 0,
            processedAt: safeMeta.refund.processedAt || null,
            completedAt: safeMeta.refund.completedAt || null,
            customerRefundStatus: safeMeta.refund.customerRefundStatus || null,
          }
        : undefined,
    rejectionReason: safeMeta.rejectionReason,
    rejectionDetails: safeMeta.rejectionDetails,
    rejectedAt: safeMeta.rejectedAt,
    rejectedByProviderUserId: safeMeta.rejectedByProviderUserId || null,
    progressStep: Number(safeMeta.progressStep) || 0,
    hasStarted: resolveJobHasStarted(meta, job),
    paymentSettlementStatus: resolvePaymentSettlementStatus(job, safeMeta),
    confirmationDeadlineAt: safeMeta.confirmationDeadlineAt || null,
    markedCompleteAt: safeMeta.markedCompleteAt || null,
    disputeId: safeMeta.disputeId || null,
    completionPaymentDue:
      safeMeta.completionPaymentDue && typeof safeMeta.completionPaymentDue === "object"
        ? {
            amountDue: Number(safeMeta.completionPaymentDue.amountDue) || 0,
            dueAt: safeMeta.completionPaymentDue.dueAt || null,
            status: safeMeta.completionPaymentDue.status || "DUE",
            obligationId: safeMeta.completionPaymentDue.obligationId || null,
            source: safeMeta.completionPaymentDue.source || null,
            resolutionLogId: safeMeta.completionPaymentDue.resolutionLogId || null,
            createdAt: safeMeta.completionPaymentDue.createdAt || null,
            notifiedAt: safeMeta.completionPaymentDue.notifiedAt || null,
          }
        : null,
    timelineEvents: safeMeta.timelineEvents,
  };
}

function createNote(author, message, title) {
  return {
    id: randomUUID(),
    authorId: author.userId,
    authorRole: author.role === "CUSTOMER" ? "user" : author.role.toLowerCase(),
    authorName: author.name || "User",
    message: String(message || "").trim(),
    title: title ? String(title).trim() : undefined,
    createdAt: new Date().toISOString(),
  };
}

function createChat(author, message) {
  return {
    id: randomUUID(),
    authorId: author.userId,
    authorRole: author.role === "CUSTOMER" ? "user" : author.role.toLowerCase(),
    authorName: author.name || "User",
    message: String(message || "").trim(),
    createdAt: new Date().toISOString(),
  };
}

function mapFrontendRole(role) {
  if (role === "user") return "CUSTOMER";
  if (role === "provider") return "PROVIDER";
  if (role === "admin") return "ADMIN";
  return "CUSTOMER";
}

module.exports = {
  createDefaultJobMeta,
  getJobMeta,
  setJobMeta,
  mutateJobMeta,
  mutateJobMetaInTransaction,
  enrichJob,
  computeProviderEntitledRemaining,
  resolveJobHasStarted,
  toFrontendStatus,
  isTerminalJobState,
  resolvePaymentSettlementStatus,
  createNote,
  createChat,
  mapFrontendRole,
  normalizeMeta,
  stripJobForApi,
  normalizeTimelineEvents,
  hasTimelineEventType,
  appendTimelineEventIfAbsent,
};
