const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

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
  };
}

function normalizeMeta(meta) {
  const base = createDefaultJobMeta();
  const merged = { ...base, ...(meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {}) };
  const esc = merged.escrow && typeof merged.escrow === "object" ? merged.escrow : {};
  merged.escrow = {
    heldAmount: Number(esc.heldAmount) || 0,
    releasedAmount: Number(esc.releasedAmount) || 0,
  };
  return merged;
}

function stripJobForApi(job) {
  if (!job || typeof job !== "object") return job;
  const { meta: _omit, ...rest } = job;
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

function toFrontendStatus(dbStatus, meta) {
  if (meta?.statusOverride) return meta.statusOverride;
  if (dbStatus === "ACCEPTED") return "ASSIGNED";
  return dbStatus;
}

function enrichJob(job, meta) {
  const safeMeta = normalizeMeta(meta);
  const status = toFrontendStatus(job.status, safeMeta);
  const held = safeMeta.escrow?.heldAmount ?? 0;
  const released = safeMeta.escrow?.releasedAmount ?? 0;
  return {
    ...stripJobForApi(job),
    status,
    escrow: {
      enabled: true,
      holdPercent: 0,
      heldAmount: held,
      releasedAmount: released,
    },
    jobNotes: safeMeta.jobNotes,
    chat: safeMeta.chat,
    laborPaid:
      typeof job.laborPaid === "boolean" ? job.laborPaid : Boolean(safeMeta.laborPaid),
    paymentReleased: typeof job.paymentReleased === "boolean" ? job.paymentReleased : false,
    servicePrice: safeMeta.servicePrice,
    servicePayment: safeMeta.servicePayment,
    providerAdjustedRequirements: safeMeta.providerAdjustedRequirements,
    userMaterialSuggestions: safeMeta.userMaterialSuggestions,
    providerSuggestions: safeMeta.providerSuggestions,
    materialPayments: safeMeta.materialPayments,
    storeOrders: safeMeta.storeOrders,
    proposedLaborPrice: safeMeta.proposedLaborPrice,
    completionConfirmedByUser: Boolean(safeMeta.completionConfirmedByUser),
    userRating: safeMeta.userRating,
    userReview: safeMeta.userReview,
    cancellationReason: safeMeta.cancellationReason,
    cancellationDetails: safeMeta.cancellationDetails,
    cancelledAt: safeMeta.cancelledAt,
    rejectionReason: safeMeta.rejectionReason,
    rejectionDetails: safeMeta.rejectionDetails,
    rejectedAt: safeMeta.rejectedAt,
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
  toFrontendStatus,
  createNote,
  createChat,
  mapFrontendRole,
  normalizeMeta,
  stripJobForApi,
};
