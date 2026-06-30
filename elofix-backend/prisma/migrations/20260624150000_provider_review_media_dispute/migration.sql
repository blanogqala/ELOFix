-- AlterTable
ALTER TABLE "ProviderReview" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "wasDisputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAfterDispute" BOOLEAN NOT NULL DEFAULT false;
