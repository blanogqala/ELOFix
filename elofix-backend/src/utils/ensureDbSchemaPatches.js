const prisma = require("../config/prisma");

/**
 * Idempotent drift repair: schema expects Provider.totalReviews; some DBs may lack it if
 * migrations were skipped or pointed at another database.
 */
async function ensureProviderTotalReviewsColumn() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "totalReviews" INTEGER NOT NULL DEFAULT 0'
    );
  } catch (e) {
    console.warn("[schema-patch] Provider.totalReviews:", e && e.message ? e.message : e);
  }
}

module.exports = { ensureProviderTotalReviewsColumn };
