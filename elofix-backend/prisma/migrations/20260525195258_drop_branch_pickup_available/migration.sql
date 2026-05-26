-- Preserve existing supplier/branch operational data. Prisma can ignore these
-- legacy columns/tables even though the current schema no longer maps them.

-- AlterTable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_pkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderReview_pkey'
  ) THEN
    ALTER TABLE "ProviderReview" RENAME CONSTRAINT "Review_pkey" TO "ProviderReview_pkey";
  END IF;
END $$;

-- RenameForeignKey
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_jobId_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderReview_jobId_fkey'
  ) THEN
    ALTER TABLE "ProviderReview" RENAME CONSTRAINT "Review_jobId_fkey" TO "ProviderReview_jobId_fkey";
  END IF;
END $$;

-- RenameIndex
ALTER INDEX IF EXISTS "Review_jobId_idx" RENAME TO "ProviderReview_jobId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "Review_jobId_key" RENAME TO "ProviderReview_jobId_key";
