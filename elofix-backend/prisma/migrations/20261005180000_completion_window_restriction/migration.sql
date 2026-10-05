-- Additive completion-window clocks.
-- Existing CustomerPaymentObligation.dueAt values are not rewritten.
-- restrictionStartsAt stays null on existing rows so they keep their stored due date.

ALTER TYPE "CustomerPaymentObligationStatus" ADD VALUE 'PAUSED';

ALTER TABLE "CustomerPaymentObligation" ADD COLUMN IF NOT EXISTS "restrictionStartsAt" TIMESTAMP(3);
ALTER TABLE "CustomerPaymentObligation" ADD COLUMN IF NOT EXISTS "windowExpiredNotifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CustomerPaymentObligation_status_restrictionStartsAt_idx"
  ON "CustomerPaymentObligation"("status", "restrictionStartsAt");
