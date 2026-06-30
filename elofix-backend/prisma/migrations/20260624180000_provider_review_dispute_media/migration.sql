-- AlterTable
ALTER TABLE "ProviderReview" ADD COLUMN     "disputeImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "disputeVideos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill before-fix media from disputes for already-resolved reviews
UPDATE "ProviderReview" pr
SET
  "disputeImages" = jd."customerImages",
  "disputeVideos" = jd."customerVideos"
FROM "JobDispute" jd
WHERE pr."jobId" = jd."jobId"
  AND pr."resolvedAfterDispute" = true
  AND cardinality(pr."disputeImages") = 0
  AND (cardinality(jd."customerImages") > 0 OR cardinality(jd."customerVideos") > 0);
