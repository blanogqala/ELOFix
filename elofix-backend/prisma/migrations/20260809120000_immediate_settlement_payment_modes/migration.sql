-- Immediate-settlement payment modes: category paymentMode, job snapshots, per-intent commission.

-- Enums
CREATE TYPE "CategoryPaymentMode" AS ENUM ('TWO_PAYMENT_50_50', 'SINGLE_PAYMENT_UPFRONT', 'SINGLE_PAYMENT_ON_COMPLETION');
CREATE TYPE "JobPaymentProgress" AS ENUM ('NONE', 'FIRST_PAID', 'FULLY_PAID');
CREATE TYPE "PaymentType" AS ENUM ('DEPOSIT', 'COMPLETION', 'FULL_UPFRONT', 'FULL_COMPLETION', 'MATERIAL_ORDER', 'DELIVERY_FEE', 'JOB_STORE_ORDER');

-- Category
ALTER TABLE "Category" ADD COLUMN "paymentMode" "CategoryPaymentMode" NOT NULL DEFAULT 'TWO_PAYMENT_50_50';

-- Job snapshot + legacy flag
ALTER TABLE "Job" ADD COLUMN "paymentModeSnapshot" "CategoryPaymentMode";
ALTER TABLE "Job" ADD COLUMN "quotedAmount" DECIMAL(12,2);
ALTER TABLE "Job" ADD COLUMN "firstPaymentAmount" DECIMAL(12,2);
ALTER TABLE "Job" ADD COLUMN "secondPaymentAmount" DECIMAL(12,2);
ALTER TABLE "Job" ADD COLUMN "paymentProgress" "JobPaymentProgress" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Job" ADD COLUMN "legacyEscrowV2" BOOLEAN NOT NULL DEFAULT false;

-- PaymentIntent accounting fields
ALTER TABLE "PaymentIntent" ADD COLUMN "paymentType" "PaymentType";
ALTER TABLE "PaymentIntent" ADD COLUMN "recipientUserId" TEXT;
ALTER TABLE "PaymentIntent" ADD COLUMN "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PaymentIntent" ADD COLUMN "recipientAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX "PaymentIntent_jobId_paymentType_idx" ON "PaymentIntent"("jobId", "paymentType");
CREATE INDEX "PaymentIntent_paymentType_idx" ON "PaymentIntent"("paymentType");

-- CommissionLedger: per-intent (drop unique jobId)
ALTER TABLE "CommissionLedger" DROP CONSTRAINT IF EXISTS "CommissionLedger_jobId_key";
ALTER TABLE "CommissionLedger" ALTER COLUMN "jobId" DROP NOT NULL;
ALTER TABLE "CommissionLedger" ADD COLUMN "paymentIntentId" TEXT;
CREATE UNIQUE INDEX "CommissionLedger_paymentIntentId_key" ON "CommissionLedger"("paymentIntentId");
CREATE INDEX "CommissionLedger_jobId_idx" ON "CommissionLedger"("jobId");

ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grandfather in-flight escrow v2 jobs (labor paid, second tranche not done)
UPDATE "Job"
SET "legacyEscrowV2" = true
WHERE "laborPaid" = true
  AND "escrowSecondReleaseDone" = false;

-- Backfill payment progress for already fully paid / partially paid labor jobs
UPDATE "Job"
SET "paymentProgress" = 'FULLY_PAID'
WHERE "laborPaid" = true
  AND ("escrowSecondReleaseDone" = true OR "isFullyReleased" = true OR "paymentReleased" = true);

UPDATE "Job"
SET "paymentProgress" = 'FIRST_PAID'
WHERE "laborPaid" = true
  AND "paymentProgress" = 'NONE'
  AND "legacyEscrowV2" = true;

-- Snapshot unpaid open jobs from category paymentMode when category id matches Job.category
UPDATE "Job" j
SET
  "paymentModeSnapshot" = c."paymentMode",
  "quotedAmount" = COALESCE(j."totalPrice", j."price"),
  "firstPaymentAmount" = CASE
    WHEN c."paymentMode" = 'TWO_PAYMENT_50_50' THEN ROUND(COALESCE(j."totalPrice", j."price") / 2, 2)
    ELSE COALESCE(j."totalPrice", j."price")
  END,
  "secondPaymentAmount" = CASE
    WHEN c."paymentMode" = 'TWO_PAYMENT_50_50' THEN COALESCE(j."totalPrice", j."price") - ROUND(COALESCE(j."totalPrice", j."price") / 2, 2)
    ELSE NULL
  END
FROM "Category" c
WHERE j."laborPaid" = false
  AND j."status" NOT IN ('CANCELLED', 'COMPLETED')
  AND (j."category" = c."id" OR LOWER(j."category") = LOWER(c."name"));
