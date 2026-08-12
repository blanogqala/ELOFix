/**
 * Recompute Provider.rating + totalReviews from paid completion reviews (rating 1–5) only.
 * Skips legacy 0-star dispute/cancellation rows that may still exist in ProviderReview.
 *
 * Run: node scripts/resync-provider-aggregates.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const { syncProviderAggregateRating } = require("../src/services/providerAggregateRating.service");

async function main() {
  const providers = await prisma.provider.findMany({ select: { id: true, businessName: true } });
  let updated = 0;
  for (const p of providers) {
    await syncProviderAggregateRating(p.id);
    updated += 1;
    if (updated % 50 === 0) {
      console.log(`Resynced ${updated}/${providers.length} providers…`);
    }
  }
  console.log(`resync-provider-aggregates: OK (${updated} providers)`);
}

main()
  .catch((e) => {
    console.error("resync-provider-aggregates failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
