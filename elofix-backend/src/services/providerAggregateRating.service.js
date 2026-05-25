const prisma = require("../config/prisma");

/**
 * Recompute Provider.rating + totalReviews from job ProviderReview rows only.
 * @param {string} providerProfileId — Provider.id (PK)
 */
async function syncProviderAggregateRating(providerProfileId) {
  const id = String(providerProfileId || "").trim();
  if (!id) return;

  const agg = await prisma.providerReview.aggregate({
    where: { providerId: id },
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

module.exports = { syncProviderAggregateRating };
