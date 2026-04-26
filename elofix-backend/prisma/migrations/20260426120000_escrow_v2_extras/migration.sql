-- Optional reporting columns for CommissionLedger (idempotent for fresh/clean DBs)
ALTER TABLE "CommissionLedger" ADD COLUMN IF NOT EXISTS "totalPrice" DECIMAL(12,2);
ALTER TABLE "CommissionLedger" ADD COLUMN IF NOT EXISTS "currency" TEXT;
UPDATE "CommissionLedger" SET "currency" = 'NGN' WHERE "currency" IS NULL;

-- Second-tranche idempotency flag on Job
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "escrowSecondReleaseDone" BOOLEAN NOT NULL DEFAULT false;
