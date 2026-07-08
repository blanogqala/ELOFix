/**
 * Remove duplicate fraud_alert penalties that were stacked on duplicate_registration
 * or fake_documentation events, then recompute trust scores from cleaned history.
 *
 * Run: node scripts/repairTrustScoreDoublePenalties.js
 * Dry run: node scripts/repairTrustScoreDoublePenalties.js --dry-run
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const {
  stripDoublePenaltyEntries,
  recomputeTrustMetricsFromHistory,
  rebuildHistoryScoreChain,
} = require("../src/utils/trustScoreHistory.util");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await prisma.providerTrustScore.findMany({
    select: {
      id: true,
      providerId: true,
      score: true,
      disputeCount: true,
      refundCount: true,
      completedJobs: true,
      positiveReviews: true,
      history: true,
      provider: { select: { businessName: true } },
    },
  });

  let updated = 0;
  for (const row of rows) {
    const history = Array.isArray(row.history) ? row.history : [];
    const cleaned = stripDoublePenaltyEntries(history);
    if (cleaned.length === history.length) continue;

    const rebuiltHistory = rebuildHistoryScoreChain(cleaned);
    const metrics = recomputeTrustMetricsFromHistory(cleaned);

    console.log(
      `[repair] ${row.provider?.businessName || row.providerId}: score ${row.score} -> ${metrics.score} ` +
        `(removed ${history.length - cleaned.length} duplicate fraud_alert entries)`
    );

    if (!dryRun) {
      await prisma.providerTrustScore.update({
        where: { id: row.id },
        data: {
          score: metrics.score,
          disputeCount: metrics.disputeCount,
          refundCount: metrics.refundCount,
          completedJobs: metrics.completedJobs,
          positiveReviews: metrics.positiveReviews,
          history: rebuiltHistory,
          lastCalculatedAt: new Date(),
        },
      });
    }
    updated += 1;
  }

  console.log(
    dryRun
      ? `Dry run complete. ${updated} provider(s) would be updated.`
      : `Done. Updated ${updated} provider trust score(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
