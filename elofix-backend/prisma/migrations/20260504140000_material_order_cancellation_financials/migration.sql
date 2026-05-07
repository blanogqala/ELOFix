ALTER TABLE "MaterialOrder"
ADD COLUMN "cancelledBy" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "refundStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "refundAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN "refundProcessedAt" TIMESTAMP(3),
ADD COLUMN "refundReference" TEXT,
ADD COLUMN "commissionReversed" DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE INDEX "MaterialOrder_cancelledAt_idx" ON "MaterialOrder"("cancelledAt");
CREATE INDEX "MaterialOrder_refundStatus_idx" ON "MaterialOrder"("refundStatus");
