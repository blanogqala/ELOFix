const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const {
  getJobMeta,
  mutateJobMeta,
  mutateJobMetaInTransaction,
  toFrontendStatus,
  enrichJob,
} = require("./jobMeta.service");
const { logAudit } = require("./auditLog.service");
const notificationEvents = require("./notificationEvents.service");
const providerTrustScore = require("./providerTrustScore.service");
const jobCompletionEvidence = require("./jobCompletionEvidence.service");
const disputeRoundService = require("./disputeRound.service");

const VALID_RESOLUTIONS = new Set([
  "PROVIDER_RETURN_FIX",
  "REFUND",
  "OTHER",
]);

function toDisputeDto(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.jobId,
    customerId: row.customerId,
    providerId: row.providerId,
    status: row.status,
    requestedResolution: row.requestedResolution,
    customerComment: row.customerComment,
    otherResolutionDetail: row.otherResolutionDetail ?? null,
    customerImages: row.customerImages || [],
    customerVideos: row.customerVideos || [],
    providerComment: row.providerComment,
    providerImages: row.providerImages || [],
    providerVideos: row.providerVideos || [],
    adminNotes: row.adminNotes,
    openedAt: row.openedAt instanceof Date ? row.openedAt.toISOString() : row.openedAt,
    resolvedAt: row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : row.resolvedAt,
    messages: (row.messages || []).map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderRole: m.senderRole,
      body: m.body,
      attachments: m.attachments || [],
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    })),
    ...extras,
  };
}

async function getDisputeById(disputeId, actorUserId, actorRole) {
  const row = await prisma.jobDispute.findUnique({
    where: { id: String(disputeId) },
    include: { messages: { orderBy: { createdAt: "asc" } }, resolutionLogs: { orderBy: { createdAt: "desc" } } },
  });
  if (!row) throw new AppError("Dispute not found", 404);
  assertCanAccessDispute(row, actorUserId, actorRole);
  const job = await prisma.job.findUnique({ where: { id: row.jobId } });
  const meta = job ? await getJobMeta(job.id) : null;
  const rounds = await disputeRoundService.getDisputeRounds(row.id);
  return toDisputeDto(row, {
    job: job ? enrichJob(job, meta) : null,
    resolutionLogs: (row.resolutionLogs || []).map((l) => ({
      id: l.id,
      adminId: l.adminId,
      action: l.action,
      amount: l.amount != null ? Number(l.amount) : null,
      notes: l.notes,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })),
    rounds,
  });
}

function assertCanAccessDispute(dispute, actorUserId, actorRole) {
  const role = String(actorRole || "").toUpperCase();
  if (role === "ADMIN") return;
  const uid = String(actorUserId);
  if (uid === String(dispute.customerId) || uid === String(dispute.providerId)) return;
  throw new AppError("Forbidden", 403);
}

async function listDisputesForActor(actorUserId, actorRole, filters = {}) {
  const role = String(actorRole || "").toUpperCase();
  const where = {};
  if (role === "CUSTOMER") where.customerId = String(actorUserId);
  else if (role === "PROVIDER") where.providerId = String(actorUserId);
  const statusFilter = String(filters.status || "").trim().toUpperCase();
  if (statusFilter && statusFilter !== "ALL") {
    if (statusFilter === "OPEN") where.status = { in: ["OPEN", "UNDER_INVESTIGATION"] };
    else if (statusFilter === "CLOSED") where.status = { in: ["RESOLVED", "CLOSED"] };
    else where.status = statusFilter;
  }
  const resolutionFilter = String(filters.requestedResolution || "").trim();
  if (resolutionFilter) where.requestedResolution = resolutionFilter;

  const rows = await prisma.jobDispute.findMany({
    where,
    orderBy: { openedAt: "desc" },
    include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
  });
  return { disputes: rows.map((r) => toDisputeDto(r)) };
}

async function openDispute(jobId, customerUserId, payload) {
  const comment = String(payload?.comment || "").trim();
  if (!comment) throw new AppError("Comment is required", 400);
  const requestedResolution = String(payload?.requestedResolution || "").trim().toUpperCase();
  if (!VALID_RESOLUTIONS.has(requestedResolution)) {
    throw new AppError("Invalid requested resolution", 400);
  }
  const otherResolutionDetail =
    payload?.otherResolutionDetail != null ? String(payload.otherResolutionDetail).trim() : "";
  if (requestedResolution === "OTHER" && !otherResolutionDetail) {
    throw new AppError("Please describe what you would like EloFix to do for Other", 400);
  }
  const images = Array.isArray(payload?.images) ? payload.images.map(String) : [];
  const videos = Array.isArray(payload?.videos) ? payload.videos.map(String) : [];
  jobCompletionEvidence.assertMediaLimits(images, videos);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.customerId) !== String(customerUserId)) {
    throw new AppError("Only the customer can open a dispute", 403);
  }
  if (!job.providerId) throw new AppError("No provider assigned", 400);

  const meta = await getJobMeta(jobId);
  const status = toFrontendStatus(job.status, meta);
  if (status !== "AWAITING_CONFIRMATION") {
    throw new AppError("Disputes can only be opened while awaiting confirmation", 400);
  }

  const existing = await prisma.jobDispute.findUnique({ where: { jobId } });
  if (existing && ["OPEN", "UNDER_INVESTIGATION"].includes(existing.status)) {
    throw new AppError("A dispute is already open for this job", 400);
  }
  const reopening = Boolean(existing && ["RESOLVED", "CLOSED"].includes(existing.status));
  if (reopening) {
    await disputeRoundService.ensureDisputeRounds(existing.id);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });

  const disputePayload = {
    status: "OPEN",
    requestedResolution,
    customerComment: comment,
    otherResolutionDetail: requestedResolution === "OTHER" ? otherResolutionDetail : null,
    customerImages: images,
    customerVideos: videos,
    resolvedAt: null,
    ...(reopening
      ? {
          providerComment: null,
          providerImages: [],
          providerVideos: [],
        }
      : {}),
  };

  const dispute = await prisma.$transaction(
    async (tx) => {
      const row = reopening
        ? await tx.jobDispute.update({
            where: { id: existing.id },
            data: disputePayload,
          })
        : await tx.jobDispute.create({
            data: {
              id: randomUUID(),
              jobId,
              customerId: job.customerId,
              providerId: job.providerId,
              ...disputePayload,
            },
          });
      await tx.disputeMessage.create({
        data: {
          id: randomUUID(),
          disputeId: row.id,
          senderId: customerUserId,
          senderRole: "CUSTOMER",
          body: comment,
          attachments: [...images, ...videos],
        },
      });
      await disputeRoundService.createDisputeRoundInTransaction(tx, row.id, {
        requestedResolution,
        customerComment: comment,
        otherResolutionDetail: requestedResolution === "OTHER" ? otherResolutionDetail : null,
        customerImages: images,
        customerVideos: videos,
      });
      await mutateJobMetaInTransaction(tx, jobId, (m) => ({
        ...m,
        statusOverride: "DISPUTED",
        disputeId: row.id,
      }));
      return row;
    },
    { maxWait: 5000, timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  try {
    const escrowSettlement = require("./payments/escrowSettlement.service");
    const intents = await prisma.paymentIntent.findMany({
      where: { jobId: String(jobId), kind: "LABOR" },
      select: { id: true },
    });
    for (const intent of intents) {
      await escrowSettlement.markIntentDisputed(intent.id);
    }
  } catch (e) {
    console.warn("[jobDispute] markIntentDisputed failed", e?.message || e);
  }

  await logAudit(reopening ? "dispute.reopened" : "dispute.opened", {
    userId: customerUserId,
    metadata: { jobId, disputeId: dispute.id, requestedResolution, reopened: reopening },
  });

  await notificationEvents.notifyDisputeOpened({
    customerId: job.customerId,
    providerId: job.providerId,
    jobId,
    disputeId: dispute.id,
    jobTitle: job.title,
  });

  const full = await prisma.jobDispute.findUnique({
    where: { id: dispute.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return toDisputeDto(full);
}

async function addProviderEvidence(disputeId, providerUserId, payload) {
  const row = await prisma.jobDispute.findUnique({ where: { id: String(disputeId) } });
  if (!row) throw new AppError("Dispute not found", 404);
  if (String(row.providerId) !== String(providerUserId)) throw new AppError("Forbidden", 403);

  const comment = payload?.comment != null ? String(payload.comment).trim() : row.providerComment;
  const images = Array.isArray(payload?.images) ? payload.images.map(String) : row.providerImages;
  const videos = Array.isArray(payload?.videos) ? payload.videos.map(String) : row.providerVideos;

  const updated = await prisma.jobDispute.update({
    where: { id: row.id },
    data: { providerComment: comment, providerImages: images, providerVideos: videos },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  await disputeRoundService.syncProviderEvidenceToActiveRound(row.id, {
    providerComment: comment,
    providerImages: images,
    providerVideos: videos,
  });
  return toDisputeDto(updated);
}

async function addDisputeMessage(disputeId, senderUserId, senderRole, body, attachments = []) {
  const row = await prisma.jobDispute.findUnique({ where: { id: String(disputeId) } });
  if (!row) throw new AppError("Dispute not found", 404);
  assertCanAccessDispute(row, senderUserId, senderRole);
  const text = String(body || "").trim();
  if (!text) throw new AppError("Message body is required", 400);

  const roleMap = { CUSTOMER: "CUSTOMER", PROVIDER: "PROVIDER", ADMIN: "ADMIN" };
  const mappedRole = roleMap[String(senderRole).toUpperCase()] || "CUSTOMER";

  await prisma.disputeMessage.create({
    data: {
      id: randomUUID(),
      disputeId: row.id,
      senderId: String(senderUserId),
      senderRole: mappedRole,
      body: text,
      attachments: Array.isArray(attachments) ? attachments.map(String) : [],
    },
  });

  return getDisputeById(disputeId, senderUserId, senderRole);
}

async function getProviderDisputeStats(providerUserId) {
  const [open, resolved, total] = await Promise.all([
    prisma.jobDispute.count({
      where: { providerId: String(providerUserId), status: { in: ["OPEN", "UNDER_INVESTIGATION"] } },
    }),
    prisma.jobDispute.count({
      where: { providerId: String(providerUserId), status: { in: ["RESOLVED", "CLOSED"] } },
    }),
    prisma.jobDispute.count({ where: { providerId: String(providerUserId) } }),
  ]);
  const trust = await providerTrustScore.getTrustScoreByUserId(providerUserId);
  return {
    totalFlagged: total,
    openDisputes: open,
    resolvedDisputes: resolved,
    trustScore: trust?.score ?? 100,
    trustScoreImpact: trust ? 100 - trust.score : 0,
  };
}

module.exports = {
  openDispute,
  getDisputeById,
  listDisputesForActor,
  addProviderEvidence,
  addDisputeMessage,
  getProviderDisputeStats,
  toDisputeDto,
};
