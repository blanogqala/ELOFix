const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { getJobMeta, toFrontendStatus } = require("./jobMeta.service");

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;

function toEvidenceDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.jobId,
    customerId: row.customerId,
    providerId: row.providerId,
    rating: row.rating,
    review: row.review,
    images: row.images || [],
    videos: row.videos || [],
    verified: row.verified,
    autoCompleted: row.autoCompleted,
    jobCategory: row.jobCategory,
    confirmedAt: row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : row.confirmedAt,
    paymentReleasedAt:
      row.paymentReleasedAt instanceof Date ? row.paymentReleasedAt.toISOString() : row.paymentReleasedAt,
  };
}

function assertMediaLimits(images, videos) {
  const imgCount = Array.isArray(images) ? images.length : 0;
  const vidCount = Array.isArray(videos) ? videos.length : 0;
  if (imgCount > MAX_IMAGES) throw new AppError(`Maximum ${MAX_IMAGES} images allowed`, 400);
  if (vidCount > MAX_VIDEOS) throw new AppError(`Maximum ${MAX_VIDEOS} videos allowed`, 400);
}

function assertMinimumMedia(images, videos) {
  const imgCount = Array.isArray(images) ? images.length : 0;
  const vidCount = Array.isArray(videos) ? videos.length : 0;
  if (imgCount === 0 && vidCount === 0) {
    throw new AppError("At least one image or video is required", 400);
  }
}

async function getEvidenceByJobId(jobId) {
  const row = await prisma.jobCompletionEvidence.findUnique({ where: { jobId: String(jobId) } });
  return toEvidenceDto(row);
}

async function getEvidenceByJobIdForActor(jobId, actorUserId, actorRole) {
  const job = await prisma.job.findUnique({
    where: { id: String(jobId) },
    select: { customerId: true, providerId: true },
  });
  if (!job) throw new AppError("Job not found", 404);
  const role = String(actorRole || "").toUpperCase();
  const uid = String(actorUserId);
  if (role === "ADMIN") {
    // allowed
  } else if (role === "CUSTOMER" && uid === String(job.customerId)) {
    // allowed
  } else if (role === "PROVIDER" && uid === String(job.providerId || "")) {
    // allowed
  } else {
    throw new AppError("Forbidden", 403);
  }
  return getEvidenceByJobId(jobId);
}

async function listVerifiedByProviderUserId(providerUserId, limit = 50) {
  const rows = await prisma.jobCompletionEvidence.findMany({
    where: { providerId: String(providerUserId), verified: true },
    orderBy: { confirmedAt: "desc" },
    take: Math.min(100, Math.max(1, Number(limit) || 50)),
  });
  return rows.map(toEvidenceDto);
}

async function createEvidenceInTransaction(tx, {
  jobId,
  customerId,
  providerId,
  rating,
  review,
  images,
  videos,
  jobCategory,
  autoCompleted,
  paymentReleasedAt,
}) {
  assertMediaLimits(images, videos);
  const existing = await tx.jobCompletionEvidence.findUnique({ where: { jobId } });
  if (existing) {
    return tx.jobCompletionEvidence.update({
      where: { jobId },
      data: {
        rating: rating != null ? Number(rating) : existing.rating,
        review: review != null ? String(review) : existing.review,
        images: Array.isArray(images) ? images : existing.images,
        videos: Array.isArray(videos) ? videos : existing.videos,
        autoCompleted: Boolean(autoCompleted),
        paymentReleasedAt: paymentReleasedAt || existing.paymentReleasedAt,
      },
    });
  }
  return tx.jobCompletionEvidence.create({
    data: {
      id: randomUUID(),
      jobId,
      customerId,
      providerId,
      rating: rating != null ? Number(rating) : null,
      review: review != null ? String(review).trim() || null : null,
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      jobCategory: String(jobCategory || "GENERAL"),
      autoCompleted: Boolean(autoCompleted),
      verified: true,
      paymentReleasedAt: paymentReleasedAt || null,
    },
  });
}

async function assertJobAwaitingConfirmation(job) {
  const meta = await getJobMeta(job.id);
  const status = toFrontendStatus(job.status, meta);
  if (status !== "AWAITING_CONFIRMATION") {
    throw new AppError("Job is not awaiting customer confirmation", 400);
  }
  if (status === "DISPUTED") {
    throw new AppError("Job has an open dispute", 400);
  }
}

module.exports = {
  MAX_IMAGES,
  MAX_VIDEOS,
  toEvidenceDto,
  getEvidenceByJobId,
  getEvidenceByJobIdForActor,
  listVerifiedByProviderUserId,
  createEvidenceInTransaction,
  assertMediaLimits,
  assertMinimumMedia,
  assertJobAwaitingConfirmation,
};
