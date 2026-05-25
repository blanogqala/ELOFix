-- Evolve Review → ProviderReview with customerId + providerId (idempotent)

ALTER TABLE "Review" RENAME TO "ProviderReview";

ALTER TABLE "ProviderReview" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "ProviderReview" ADD COLUMN IF NOT EXISTS "providerId" TEXT;

UPDATE "ProviderReview" pr
SET
  "customerId" = j."customerId",
  "providerId" = p."id"
FROM "Job" j
LEFT JOIN "Provider" p ON p."userId" = j."providerId"
WHERE pr."jobId" = j."id"
  AND (pr."customerId" IS NULL OR pr."providerId" IS NULL);

DELETE FROM "ProviderReview" WHERE "customerId" IS NULL OR "providerId" IS NULL;

ALTER TABLE "ProviderReview" ALTER COLUMN "customerId" SET NOT NULL;
ALTER TABLE "ProviderReview" ALTER COLUMN "providerId" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "ProviderReview" ADD CONSTRAINT "ProviderReview_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderReview" ADD CONSTRAINT "ProviderReview_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProviderReview_providerId_idx" ON "ProviderReview"("providerId");
CREATE INDEX IF NOT EXISTS "ProviderReview_customerId_idx" ON "ProviderReview"("customerId");
CREATE INDEX IF NOT EXISTS "ProviderReview_createdAt_idx" ON "ProviderReview"("createdAt");
