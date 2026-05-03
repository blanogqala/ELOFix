const prisma = require("../config/prisma");

/**
 * Recompute Provider.rating + totalReviews from job Review rows and MaterialOrderRating rows.
 * @param {string} providerProfileId — Provider.id (PK)
 */
async function syncProviderAggregateRating(providerProfileId) {
  const id = String(providerProfileId || "").trim();
  if (!id) return;
  const profile = await prisma.provider.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!profile) return;

  const [jobReviewRows, materialRows] = await Promise.all([
    prisma.review.findMany({
      where: { job: { providerId: profile.userId } },
      select: { rating: true },
    }),
    prisma.materialOrderRating.findMany({
      where: { providerId: profile.id },
      select: { rating: true },
    }),
  ]);

  const values = [
    ...jobReviewRows.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n)),
    ...materialRows.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n)),
  ];
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  await prisma.provider.update({
    where: { id: profile.id },
    data: { rating: avg, totalReviews: values.length },
  });
}

module.exports = { syncProviderAggregateRating };
