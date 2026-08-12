const prisma = require("../config/prisma");

/** Only 1–5 star completion reviews count toward public rating/list. */
const PUBLIC_REVIEW_RATING_FILTER = { rating: { gte: 1 } };

/**
 * Recompute Provider.rating + totalReviews from paid completion reviews (rating 1–5) only.
 * @param {string} providerProfileId — Provider.id (PK)
 */
async function syncProviderAggregateRating(providerProfileId) {
  const id = String(providerProfileId || "").trim();
  if (!id) return;

  const agg = await prisma.providerReview.aggregate({
    where: { providerId: id, ...PUBLIC_REVIEW_RATING_FILTER },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const count = Number(agg._count.rating) || 0;
  const avg = count && agg._avg.rating != null ? Number(agg._avg.rating) : 0;

  await prisma.provider.update({
    where: { id },
    data: { rating: avg, totalReviews: count },
  });
}

module.exports = { syncProviderAggregateRating, PUBLIC_REVIEW_RATING_FILTER };
