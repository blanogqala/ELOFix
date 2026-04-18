const { randomUUID } = require("crypto");
const { readState, updateState } = require("./jsonStore.service");

function createDefaultJobMeta() {
  return {
    statusOverride: null,
    jobNotes: [],
    chat: [],
    laborPaid: false,
    servicePrice: null,
    servicePayment: null,
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
  return { ...createDefaultJobMeta(), ...(meta || {}) };
}

async function getJobMeta(jobId) {
  const state = await readState();
  return normalizeMeta(state.jobsMeta[jobId]);
}

async function setJobMeta(jobId, patch) {
  let nextMeta;
  await updateState((state) => {
    const current = normalizeMeta(state.jobsMeta[jobId]);
    nextMeta = { ...current, ...patch };
    state.jobsMeta[jobId] = nextMeta;
    return state;
  });
  return nextMeta;
}

async function mutateJobMeta(jobId, mutator) {
  let nextMeta;
  await updateState((state) => {
    const current = normalizeMeta(state.jobsMeta[jobId]);
    nextMeta = mutator(current) || current;
    state.jobsMeta[jobId] = normalizeMeta(nextMeta);
    nextMeta = state.jobsMeta[jobId];
    return state;
  });
  return nextMeta;
}

function toFrontendStatus(dbStatus, meta) {
  if (meta?.statusOverride) return meta.statusOverride;
  if (dbStatus === "ACCEPTED") return "ASSIGNED";
  return dbStatus;
}

function enrichJob(job, meta) {
  const safeMeta = normalizeMeta(meta);
  const status = toFrontendStatus(job.status, safeMeta);
  return {
    ...job,
    status,
    jobNotes: safeMeta.jobNotes,
    chat: safeMeta.chat,
    laborPaid: Boolean(safeMeta.laborPaid),
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
  enrichJob,
  toFrontendStatus,
  createNote,
  createChat,
  mapFrontendRole,
};
