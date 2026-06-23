-- AlterEnum (must be committed before REFUND can be used — backfill is in next migration)
ALTER TYPE "DisputeRequestedResolution" ADD VALUE IF NOT EXISTS 'REFUND';

-- AlterTable
ALTER TABLE "JobDispute" ADD COLUMN IF NOT EXISTS "otherResolutionDetail" TEXT;
