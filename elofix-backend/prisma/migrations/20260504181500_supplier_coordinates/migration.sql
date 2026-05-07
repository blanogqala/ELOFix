-- AlterTable (idempotent if columns already applied via db push)
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
