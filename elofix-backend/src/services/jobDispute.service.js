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
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../constants/auditActions");
const notificationEvents = require("./notificationEvents.service");
const providerTrustScore = require("./providerTrustScore.service");
const jobCompletionEvidence = require("./jobCompletionEvidence.service");
const disputeRoundService = require("./disputeRound.service");
const { upsertDisputeReviewForJob } = require("./providerReview.service");
const { syncProviderAggregateRating } = require("./providerAggregateRating.service");

const VALID_RESOLUTIONS = new Set([
  "PROVIDER_RETURN_FIX",
  "REFUND",
  "OTHER",
]);

async function mapDisputeMessages(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const senderIds = [...new Set(msgs.map((m) => String(m.senderId)).filter(Boolean))];
  const users =
    senderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = Object.fromEntries(users.map((u) => [String(u.id), u.name]));
  return msgs.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderRole: m.senderRole,
    senderName: nameById[String(m.senderId)] || undefined,
    body: m.body,
    attachments: m.attachments || [],
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  }));
}

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
    messages:
      extras.messages ??
      (row.messages || []).map((m) => ({
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
  const [customer, provider, messages] = await Promise.all([
    prisma.user.findUnique({ where: { id: row.customerId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: row.providerId }, select: { name: true } }),
    mapDisputeMessages(row.messages),
  ]);
  return toDisputeDto(row, {
    customerName: customer?.name,
    providerName: provider?.name,
    messages,
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
  else if (role !== "ADMIN") {
    throw new AppError("Forbidden", 403);
  }
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

async function getExistingDisputeForJob(jobId, tx) {
  const client = tx || prisma;
  return client.jobDispute.findUnique({ where: { jobId: String(jobId) } });
}

function assertNoActiveDispute(existing) {
  if (existing && ["OPEN", "UNDER_INVESTIGATION"].includes(existing.status)) {
    throw new AppError("A dispute is already open for this job", 400);
  }
}

async function createCustomerDisputeInTransaction(tx, params) {
  const {
    job,
    customerUserId,
    providerRow,
    comment,
    requestedResolution,
    otherResolutionDetail = null,
    images = [],
    videos = [],
    existing = null,
    reopening = false,
    metaExtras = {},
  } = params;

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

  const row = reopening
    ? await tx.jobDispute.update({
        where: { id: existing.id },
        data: disputePayload,
      })
    : await tx.jobDispute.create({
        data: {
          id: randomUUID(),
          jobId: job.id,
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

  await mutateJobMetaInTransaction(tx, job.id, (m) => ({
    ...m,
    statusOverride: "DISPUTED",
    escrowFrozen: true,
    disputeId: row.id,
    ...metaExtras,
  }));

  if (providerRow) {
    await upsertDisputeReviewForJob(
      {
        jobId: job.id,
        customerId: job.customerId,
        providerProfileId: providerRow.id,
        comment,
        images,
        videos,
      },
      tx
    );
  }

  return row;
}

async function createCancellationDisputeInTransaction(tx, params) {
  const {
    job,
    actorUserId,
    actorRole,
    providerRow,
    comment,
    existing = null,
    reopening = false,
    metaExtras = {},
  } = params;

  const isProvider = actorRole === "provider";
  const disputePayload = {
    status: "OPEN",
    requestedResolution: "REFUND",
    // Prisma schema requires customerComment (non-null). For provider-initiated cancellations,
    // preserve an existing customer comment if present; otherwise store an empty string.
    customerComment: isProvider ? existing?.customerComment ?? "" : comment,
    providerComment: isProvider ? comment : reopening ? null : existing?.providerComment ?? null,
    otherResolutionDetail: null,
    customerImages: isProvider ? existing?.customerImages ?? [] : [],
    customerVideos: isProvider ? existing?.customerVideos ?? [] : [],
    providerImages: isProvider ? [] : reopening ? [] : existing?.providerImages ?? [],
    providerVideos: isProvider ? [] : reopening ? [] : existing?.providerVideos ?? [],
    resolvedAt: null,
  };

  const row = reopening
    ? await tx.jobDispute.update({
        where: { id: existing.id },
        data: disputePayload,
      })
    : await tx.jobDispute.create({
        data: {
          id: randomUUID(),
          // Some Prisma client generations require providing the relation explicitly.
          job: { connect: { id: job.id } },
          customerId: job.customerId,
          providerId: job.providerId,
          ...disputePayload,
        },
      });

  await tx.disputeMessage.create({
    data: {
      id: randomUUID(),
      disputeId: row.id,
      senderId: actorUserId,
      senderRole: isProvider ? "PROVIDER" : "CUSTOMER",
      body: comment,
      attachments: [],
    },
  });

  await disputeRoundService.createDisputeRoundInTransaction(tx, row.id, {
    requestedResolution: "REFUND",
    customerComment: isProvider ? null : comment,
    otherResolutionDetail: null,
    customerImages: isProvider ? [] : [],
    customerVideos: isProvider ? [] : [],
    providerComment: isProvider ? comment : null,
    providerImages: isProvider ? [] : [],
    providerVideos: isProvider ? [] : [],
  });

  await mutateJobMetaInTransaction(tx, job.id, (m) => ({
    ...m,
    statusOverride: "DISPUTED",
    escrowFrozen: true,
    disputeId: row.id,
    ...metaExtras,
  }));

  if (providerRow) {
    await upsertDisputeReviewForJob(
      {
        jobId: job.id,
        customerId: job.customerId,
        providerProfileId: providerRow.id,
        comment: isProvider ? null : comment,
        images: isProvider ? [] : [],
        videos: isProvider ? [] : [],
      },
      tx
    );
  }

  return row;
}

async function postCreateDisputeSideEffects(dispute, job, actorUserId, options = {}) {
  const {
    reopening = false,
    requestedResolution = dispute.requestedResolution,
    cancellationActorRole = null,
  } = options;
  const providerRow = job.providerId
    ? await prisma.provider.findUnique({ where: { userId: job.providerId }, select: { id: true } })
    : null;

  try {
    const escrowSettlement = require("./payments/escrowSettlement.service");
    const intents = await prisma.paymentIntent.findMany({
      where: { jobId: String(job.id), kind: "LABOR" },
      select: { id: true },
    });
    for (const intent of intents) {
      await escrowSettlement.markIntentDisputed(intent.id);
    }
  } catch (e) {
    console.warn("[jobDispute] markIntentDisputed failed", e?.message || e);
  }

  if (providerRow) {
    await syncProviderAggregateRating(providerRow.id);
  }

  await logAudit(reopening ? AUDIT_ACTIONS.DISPUTE_REOPENED : AUDIT_ACTIONS.DISPUTE_OPENED, {
    userId: actorUserId,
    entityType: ENTITY_TYPES.DISPUTE,
    entityId: dispute.id,
    newValue: { jobId: job.id, requestedResolution, reopened: reopening },
  });

  await notificationEvents.notifyDisputeOpened({
    customerId: job.customerId,
    providerId: job.providerId,
    jobId: job.id,
    disputeId: dispute.id,
    jobTitle: job.title,
    cancellationActorRole,
  });
}

async function openDisputeFromCancellation(jobId, actorUserId, payload, tx) {
  const reason = String(payload?.reason || "").trim();
  const details = payload?.details != null ? String(payload.details).trim() : "";
  const comment = [reason, details].filter(Boolean).join(". ").trim();
  if (!comment) throw new AppError("Cancellation reason is required", 400);

  const actorRole = String(payload?.actorRole || "customer").toLowerCase();
  if (!["customer", "provider"].includes(actorRole)) {
    throw new AppError("Invalid cancellation actor", 400);
  }

  const job = await (tx || prisma).job.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError("Job not found", 404);
  if (!job.providerId) throw new AppError("No provider assigned", 400);
  if (actorRole === "customer" && String(job.customerId) !== String(actorUserId)) {
    throw new AppError("Only the customer can cancel this job", 403);
  }
  if (actorRole === "provider" && String(job.providerId) !== String(actorUserId)) {
    throw new AppError("Only the assigned provider can cancel this job", 403);
  }
  const meta = await getJobMeta(jobId);
  const { isLaborPaid } = require("../utils/jobCancellationPolicy.util");
  if (!isLaborPaid(job, meta)) {
    throw new AppError("Cancellation disputes require paid labor", 400);
  }

  const status = String(toFrontendStatus(job.status, meta) || "").toUpperCase();
  if (["COMPLETED", "CANCELLED", "DISPUTED"].includes(status)) {
    throw new AppError("This job cannot be cancelled through dispute review", 400);
  }

  const client = tx || prisma;
  const existing = await getExistingDisputeForJob(jobId, client);
  assertNoActiveDispute(existing);
  const reopening = Boolean(existing && ["RESOLVED", "CLOSED"].includes(existing.status));
  if (reopening) {
    await disputeRoundService.ensureDisputeRounds(existing.id);
  }

  const providerRow = await client.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });

  const metaExtras = {
    cancellationReason: reason || null,
    cancellationDetails: details || null,
    cancelledBy: actorRole,
    cancellationProviderEnRoute: Boolean(meta?.cancellationProviderEnRoute),
    cancellationSource: actorRole === "provider" ? "provider_cancel" : "customer_cancel",
    cancelledAt: new Date().toISOString(),
  };

  const runInTx = async (innerTx) =>
    createCancellationDisputeInTransaction(innerTx, {
      job,
      actorUserId,
      actorRole,
      providerRow,
      comment,
      existing,
      reopening,
      metaExtras,
    });

  const dispute = tx ? await runInTx(tx) : await prisma.$transaction(runInTx, {
    maxWait: 5000,
    timeout: 15000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  if (!tx) {
    await postCreateDisputeSideEffects(dispute, job, actorUserId, {
      reopening,
      requestedResolution: "REFUND",
      cancellationActorRole: actorRole,
    });
  }

  return dispute;
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

  const existing = await getExistingDisputeForJob(jobId);
  assertNoActiveDispute(existing);
  const reopening = Boolean(existing && ["RESOLVED", "CLOSED"].includes(existing.status));
  if (reopening) {
    await disputeRoundService.ensureDisputeRounds(existing.id);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });

  const dispute = await prisma.$transaction(
    async (tx) =>
      createCustomerDisputeInTransaction(tx, {
        job,
        customerUserId,
        providerRow,
        comment,
        requestedResolution,
        otherResolutionDetail,
        images,
        videos,
        existing,
        reopening,
      }),
    { maxWait: 5000, timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  await postCreateDisputeSideEffects(dispute, job, customerUserId, { reopening, requestedResolution });

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
  openDisputeFromCancellation,
  createCustomerDisputeInTransaction,
  postCreateDisputeSideEffects,
  getDisputeById,
  listDisputesForActor,
  addProviderEvidence,
  addDisputeMessage,
  getProviderDisputeStats,
  toDisputeDto,
  mapDisputeMessages,
};
