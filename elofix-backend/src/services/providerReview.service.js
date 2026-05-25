const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { syncProviderAggregateRating } = require("./providerAggregateRating.service");

const RATING_MIN = 1;
const RATING_MAX = 5;

function normalizeRating(value) {
  const r = Math.round(Number(value));
  if (!Number.isFinite(r) || r < RATING_MIN || r > RATING_MAX) {
    throw new AppError(`rating must be between ${RATING_MIN} and ${RATING_MAX}`, 400);
  }
  return r;
}

function emptyBreakdown() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/**
 * @param {string} providerProfileId — Provider.id
 */
async function aggregateRatingBreakdown(providerProfileId) {
  const rows = await prisma.providerReview.groupBy({
    by: ["rating"],
    where: { providerId: providerProfileId },
    _count: { rating: true },
  });
  const breakdown = emptyBreakdown();
  for (const row of rows) {
    const star = Number(row.rating);
    if (star >= 1 && star <= 5) {
      breakdown[star] = row._count.rating;
    }
  }
  return breakdown;
}

function mapReviewRow(r) {
  return {
    id: r.id,
    userId: r.customerId,
    userName: r.customer?.name || "Customer",
    rating: r.rating,
    comment: r.comment || "",
    jobId: r.jobId,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    jobTitle: r.job?.title || "",
    jobCategory: r.job?.category || "",
  };
}

/**
 * Create or update a job review (one per completed job). Caller must validate job access.
 */
async function upsertProviderReviewForJob({
  jobId,
  customerId,
  providerProfileId,
  rating,
  comment,
  allowEditWithinMinutes = 10,
}) {
  const jid = String(jobId || "").trim();
  const cid = String(customerId || "").trim();
  const pid = String(providerProfileId || "").trim();
  if (!jid || !cid || !pid) {
    throw new AppError("jobId, customerId, and providerId are required", 400);
  }

  const r = normalizeRating(rating);
  const trimmedComment =
    comment != null && String(comment).trim() !== "" ? String(comment).trim() : null;

  const existing = await prisma.providerReview.findUnique({ where: { jobId: jid } });
  if (existing) {
    const ageMs = Date.now() - existing.createdAt.getTime();
    if (ageMs > allowEditWithinMinutes * 60 * 1000) {
      throw new AppError(
        `Review can only be edited within ${allowEditWithinMinutes} minutes of submission`,
        400
      );
    }
    if (String(existing.customerId) !== cid) {
      throw new AppError("Forbidden", 403);
    }
  }

  const row = await prisma.providerReview.upsert({
    where: { jobId: jid },
    create: {
      id: randomUUID(),
      jobId: jid,
      customerId: cid,
      providerId: pid,
      rating: r,
      comment: trimmedComment,
    },
    update: {
      rating: r,
      comment: trimmedComment,
    },
    include: {
      customer: { select: { name: true } },
      job: { select: { title: true, category: true } },
    },
  });

  await syncProviderAggregateRating(pid);
  return mapReviewRow(row);
}

/**
 * Standalone review submission for a completed job (customer only).
 */
async function createProviderReview({ jobId, customerUserId, rating, comment }) {
  const jid = String(jobId || "").trim();
  if (!jid) throw new AppError("jobId is required", 400);

  const job = await prisma.job.findUnique({
    where: { id: jid },
    select: {
      id: true,
      status: true,
      customerId: true,
      providerId: true,
      providerReview: { select: { id: true } },
    },
  });
  if (!job) throw new AppError("Job not found", 404);
  if (String(job.customerId) !== String(customerUserId || "")) {
    throw new AppError("Forbidden", 403);
  }
  if (job.status !== "COMPLETED") {
    throw new AppError("Only completed jobs can be reviewed", 400);
  }
  if (!job.providerId) {
    throw new AppError("No provider assigned to this job", 400);
  }

  const providerRow = await prisma.provider.findUnique({
    where: { userId: job.providerId },
    select: { id: true },
  });
  if (!providerRow) throw new AppError("Provider not found", 404);

  if (job.providerReview) {
    throw new AppError("You already submitted a review for this job", 409);
  }

  return upsertProviderReviewForJob({
    jobId: jid,
    customerId: job.customerId,
    providerProfileId: providerRow.id,
    rating,
    comment,
    allowEditWithinMinutes: 0,
  });
}

async function resolveProviderProfileId(routeId) {
  const normalized = String(routeId || "").trim();
  if (!normalized) return null;
  const profile = await prisma.provider.findFirst({
    where: { OR: [{ userId: normalized }, { id: normalized }] },
    select: { id: true },
  });
  return profile?.id || null;
}

async function listProviderReviews(providerRouteId, { limit = 20, offset = 0 } = {}) {
  const providerId = await resolveProviderProfileId(providerRouteId);
  if (!providerId) throw new AppError("Provider not found", 404);

  const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = Math.max(Number(offset) || 0, 0);

  const [rows, total, breakdown, profile] = await Promise.all([
    prisma.providerReview.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        customer: { select: { name: true } },
        job: { select: { title: true, category: true } },
      },
    }),
    prisma.providerReview.count({ where: { providerId } }),
    aggregateRatingBreakdown(providerId),
    prisma.provider.findUnique({
      where: { id: providerId },
      select: { rating: true, totalReviews: true },
    }),
  ]);

  const providerUser = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { userId: true },
  });
  const completedJobs = providerUser
    ? await prisma.job.count({
        where: { providerId: providerUser.userId, status: "COMPLETED" },
      })
    : 0;

  return {
    reviews: rows.map(mapReviewRow),
    total,
    limit: take,
    offset: skip,
    averageRating: Number(profile?.rating) || 0,
    totalReviews: Number(profile?.totalReviews) || 0,
    ratingBreakdown: breakdown,
    completedJobs,
  };
}

async function getProviderReputationSummary(providerProfileId) {
  const id = String(providerProfileId || "").trim();
  if (!id) return null;
  const [breakdown, profile] = await Promise.all([
    aggregateRatingBreakdown(id),
    prisma.provider.findUnique({
      where: { id },
      select: { rating: true, totalReviews: true, approved: true, profileCompleted: true, documents: true, createdAt: true, user: { select: { createdAt: true } } },
    }),
  ]);
  if (!profile) return null;
  return {
    averageRating: Number(profile.rating) || 0,
    totalReviews: Number(profile.totalReviews) || 0,
    ratingBreakdown: breakdown,
    approved: profile.approved,
    profileCompleted: profile.profileCompleted,
    documents: profile.documents,
    memberSince: profile.user?.createdAt,
  };
}

module.exports = {
  RATING_MIN,
  RATING_MAX,
  normalizeRating,
  aggregateRatingBreakdown,
  upsertProviderReviewForJob,
  createProviderReview,
  listProviderReviews,
  getProviderReputationSummary,
  mapReviewRow,
};
