-- Additive: transaction-specific checkout legal acceptance evidence on LegalAcceptanceEvent.

ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "deliveryPolicyVersion" TEXT;
ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT;
ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "merchantReference" TEXT;
ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "jobId" TEXT;
ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "materialOrderId" TEXT;
ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "paymentIntentKind" TEXT;
ALTER TABLE "LegalAcceptanceEvent" ADD COLUMN IF NOT EXISTS "paymentType" TEXT;

CREATE INDEX IF NOT EXISTS "LegalAcceptanceEvent_paymentIntentId_idx" ON "LegalAcceptanceEvent"("paymentIntentId");
CREATE INDEX IF NOT EXISTS "LegalAcceptanceEvent_merchantReference_idx" ON "LegalAcceptanceEvent"("merchantReference");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LegalAcceptanceEvent_paymentIntentId_fkey'
  ) THEN
    ALTER TABLE "LegalAcceptanceEvent"
      ADD CONSTRAINT "LegalAcceptanceEvent_paymentIntentId_fkey"
      FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
