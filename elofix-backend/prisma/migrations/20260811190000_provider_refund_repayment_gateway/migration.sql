-- Provider refund repayment via gateway checkout + original payment refund tracking

-- AlterEnum: PaymentIntentKind
ALTER TYPE "PaymentIntentKind" ADD VALUE IF NOT EXISTS 'PROVIDER_REFUND_REPAYMENT';

-- CreateEnum: ProviderRefundRepaymentMethod
DO $$ BEGIN
  CREATE TYPE "ProviderRefundRepaymentMethod" AS ENUM ('GATEWAY', 'BANK_TRANSFER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- PaymentIntent.refundedAmount for partial multi-tranche refunds
ALTER TABLE "PaymentIntent"
  ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ProviderRefundRepayment extensions
ALTER TABLE "ProviderRefundRepayment"
  ADD COLUMN IF NOT EXISTS "jobId" TEXT,
  ADD COLUMN IF NOT EXISTS "method" "ProviderRefundRepaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT,
  ADD COLUMN IF NOT EXISTS "gatewayTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "merchantReference" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderRefundRepayment_paymentIntentId_key"
  ON "ProviderRefundRepayment"("paymentIntentId");

CREATE INDEX IF NOT EXISTS "ProviderRefundRepayment_jobId_idx"
  ON "ProviderRefundRepayment"("jobId");

CREATE INDEX IF NOT EXISTS "ProviderRefundRepayment_method_idx"
  ON "ProviderRefundRepayment"("method");

DO $$ BEGIN
  ALTER TABLE "ProviderRefundRepayment"
    ADD CONSTRAINT "ProviderRefundRepayment_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderRefundRepayment"
    ADD CONSTRAINT "ProviderRefundRepayment_paymentIntentId_fkey"
    FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
