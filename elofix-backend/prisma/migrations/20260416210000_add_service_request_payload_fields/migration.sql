-- AlterTable
ALTER TABLE "Job"
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "locationDetails" JSONB,
ADD COLUMN     "materials" JSONB,
ADD COLUMN     "measurements" JSONB;
