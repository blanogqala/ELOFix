const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { syncProviderAggregateRating } = require("./providerAggregateRating.service");
const notificationEvents = require("./notificationEvents.service");

const RATING_MIN = 1;
const RATING_MAX = 5;
const DISPUTE_RATING = 0;

function normalizeRating(value) {
  const r = Math.round(Number(value));
  if (!Number.isFinite(r) || r < RATING_MIN || r > RATING_MAX) {
    throw new AppError(`rating must be between ${RATING_MIN} and ${RATING_MAX}`, 400);
  }
  return r;
}

function normalizePublicRating(value) {
  const r = Math.round(Number(value));
  if (!Number.isFinite(r) || r < DISPUTE_RATING || r > RATING_MAX) {
    throw new AppError(`rating must be between ${DISPUTE_RATING} and ${RATING_MAX}`, 400);
  }
  return r;
}

function emptyBreakdown() {
  return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
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
    if (star >= 0 && star <= 5) {
      breakdown[star] = row._count.rating;
    }
  }
  return breakdown;
}

function mapReviewRow(r, evidenceFallback = null, disputeFallback = null) {
  const rowImages = Array.isArray(r.images) ? r.images : [];
  const rowVideos = Array.isArray(r.videos) ? r.videos : [];
  const rowDisputeImages = Array.isArray(r.disputeImages) ? r.disputeImages : [];
  const rowDisputeVideos = Array.isArray(r.disputeVideos) ? r.disputeVideos : [];
  const fallbackImages = evidenceFallback?.images || [];
  const fallbackVideos = evidenceFallback?.videos || [];
  const fallbackDisputeImages = disputeFallback?.customerImages || [];
  const fallbackDisputeVideos = disputeFallback?.customerVideos || [];
  const resolvedAfterDispute = Boolean(r.resolvedAfterDispute);
  const disputeImages =
    rowDisputeImages.length > 0
      ? rowDisputeImages
      : resolvedAfterDispute
        ? fallbackDisputeImages
        : [];
  const disputeVideos =
    rowDisputeVideos.length > 0
      ? rowDisputeVideos
      : resolvedAfterDispute
        ? fallbackDisputeVideos
        : [];
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
    images: rowImages.length > 0 ? rowImages : fallbackImages,
    videos: rowVideos.length > 0 ? rowVideos : fallbackVideos,
    disputeImages,
    disputeVideos,
    wasDisputed: Boolean(r.wasDisputed),
    resolvedAfterDispute,
  };
}

/**
 * Create or update a dispute review (rating 0) visible on the provider profile.
 */
async function upsertDisputeReviewForJob(
  {
    jobId,
    customerId,
    providerProfileId,
    comment,
    images = [],
    videos = [],
  },
  tx = null
) {
  const jid = String(jobId || "").trim();
  const cid = String(customerId || "").trim();
  const pid = String(providerProfileId || "").trim();
  if (!jid || !cid || !pid) {
    throw new AppError("jobId, customerId, and providerId are required", 400);
  }

  const trimmedComment = String(comment || "").trim() || null;
  const client = tx || prisma;
  const imageList = Array.isArray(images) ? images.map(String) : [];
  const videoList = Array.isArray(videos) ? videos.map(String) : [];
  const data = {
    rating: DISPUTE_RATING,
    comment: trimmedComment,
    images: imageList,
    videos: videoList,
    disputeImages: imageList,
    disputeVideos: videoList,
    wasDisputed: true,
    resolvedAfterDispute: false,
  };

  return client.providerReview.upsert({
    where: { jobId: jid },
    create: {
      id: randomUUID(),
      jobId: jid,
      customerId: cid,
      providerId: pid,
      ...data,
    },
    update: data,
  });
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
  images = [],
  videos = [],
  wasDisputed = false,
  resolvedAfterDispute = false,
  allowEditWithinMinutes = 10,
  allowDisputeResolutionEdit = false,
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
  if (existing && !allowDisputeResolutionEdit) {
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
  } else if (existing && allowDisputeResolutionEdit) {
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
      images: Array.isArray(images) ? images.map(String) : [],
      videos: Array.isArray(videos) ? videos.map(String) : [],
      wasDisputed: Boolean(wasDisputed),
      resolvedAfterDispute: Boolean(resolvedAfterDispute),
    },
    update: {
      rating: r,
      comment: trimmedComment,
      images: Array.isArray(images) ? images.map(String) : [],
      videos: Array.isArray(videos) ? videos.map(String) : [],
      wasDisputed: Boolean(wasDisputed) || Boolean(existing?.wasDisputed),
      resolvedAfterDispute: Boolean(resolvedAfterDispute),
    },
    include: {
      customer: { select: { name: true } },
      job: { select: { title: true, category: true } },
    },
  });

  await syncProviderAggregateRating(pid);
  if (!existing) {
    const provider = await prisma.provider.findUnique({
      where: { id: pid },
      select: { userId: true },
    });
    if (provider?.userId) {
      await notificationEvents.notifyProviderReviewReceived(provider.userId, jid, row.job?.title);
    }
  }
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

  const jobIdsNeedingEvidence = rows
    .filter((r) => !(r.images?.length) && !(r.videos?.length))
    .map((r) => r.jobId);
  const jobIdsNeedingDisputeMedia = rows
    .filter(
      (r) =>
        r.resolvedAfterDispute &&
        !(r.disputeImages?.length) &&
        !(r.disputeVideos?.length)
    )
    .map((r) => r.jobId);
  const evidenceByJobId = new Map();
  if (jobIdsNeedingEvidence.length > 0) {
    const evidenceRows = await prisma.jobCompletionEvidence.findMany({
      where: { jobId: { in: jobIdsNeedingEvidence } },
      select: { jobId: true, images: true, videos: true },
    });
    for (const ev of evidenceRows) {
      evidenceByJobId.set(ev.jobId, ev);
    }
  }
  const disputeByJobId = new Map();
  if (jobIdsNeedingDisputeMedia.length > 0) {
    const disputeRows = await prisma.jobDispute.findMany({
      where: { jobId: { in: jobIdsNeedingDisputeMedia } },
      select: { jobId: true, customerImages: true, customerVideos: true },
    });
    for (const d of disputeRows) {
      disputeByJobId.set(d.jobId, d);
    }
  }

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
    reviews: rows.map((r) =>
      mapReviewRow(
        r,
        evidenceByJobId.get(r.jobId) || null,
        disputeByJobId.get(r.jobId) || null
      )
    ),
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
  DISPUTE_RATING,
  normalizeRating,
  normalizePublicRating,
  aggregateRatingBreakdown,
  upsertProviderReviewForJob,
  upsertDisputeReviewForJob,
  createProviderReview,
  listProviderReviews,
  getProviderReputationSummary,
  mapReviewRow,
};
