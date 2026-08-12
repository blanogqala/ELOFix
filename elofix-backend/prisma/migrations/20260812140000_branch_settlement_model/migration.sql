-- Branch settlement model: bank profile verification, order settlement tracking, event ledger

CREATE TYPE "BranchSettlementStatus" AS ENUM (
  'NOT_APPLICABLE',
  'NOT_SUPPORTED',
  'PENDING',
  'PROCESSING',
  'SETTLED',
  'FAILED',
  'REVERSED'
);

CREATE TYPE "BranchSettlementEventType" AS ENUM (
  'MATERIAL_PAYMENT',
  'PLATFORM_COMMISSION',
  'BRANCH_SETTLEMENT',
  'SETTLEMENT_PENDING',
  'SETTLEMENT_COMPLETED',
  'REFUND',
  'REVERSAL',
  'SETTLEMENT_FAILED'
);

-- Extend BranchWithdrawalProfile (branch payout / bank details)
ALTER TABLE "BranchWithdrawalProfile"
  ADD COLUMN "accountType" TEXT,
  ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN "gatewayProvider" "PaymentProvider",
  ADD COLUMN "gatewayRecipientId" TEXT,
  ADD COLUMN "gatewayProfileStatus" TEXT,
  ADD COLUMN "gatewayProfilePayload" JSONB;

CREATE INDEX "BranchWithdrawalProfile_verificationStatus_idx" ON "BranchWithdrawalProfile"("verificationStatus");

-- Extend MaterialOrder settlement fields
ALTER TABLE "MaterialOrder"
  ADD COLUMN "settlementStatus" "BranchSettlementStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "settlementAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gatewaySettlementId" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "settlementFailureReason" TEXT;

CREATE INDEX "MaterialOrder_branchId_settlementStatus_idx" ON "MaterialOrder"("branchId", "settlementStatus");

-- Extend PaymentIntent branch settlement fields
ALTER TABLE "PaymentIntent"
  ADD COLUMN "branchId" TEXT,
  ADD COLUMN "branchSettlementStatus" "BranchSettlementStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "branchSettlementId" TEXT;

CREATE INDEX "PaymentIntent_branchId_idx" ON "PaymentIntent"("branchId");
CREATE INDEX "PaymentIntent_branchSettlementStatus_idx" ON "PaymentIntent"("branchSettlementStatus");

-- Branch settlement event ledger
CREATE TABLE "BranchSettlementEvent" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "materialOrderId" TEXT,
  "paymentIntentId" TEXT,
  "eventType" "BranchSettlementEventType" NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "settlementStatus" "BranchSettlementStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "gatewayReference" TEXT,
  "gatewaySettlementId" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchSettlementEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BranchSettlementEvent"
  ADD CONSTRAINT "BranchSettlementEvent_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchSettlementEvent"
  ADD CONSTRAINT "BranchSettlementEvent_materialOrderId_fkey"
  FOREIGN KEY ("materialOrderId") REFERENCES "MaterialOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchSettlementEvent"
  ADD CONSTRAINT "BranchSettlementEvent_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BranchSettlementEvent_branchId_idx" ON "BranchSettlementEvent"("branchId");
CREATE INDEX "BranchSettlementEvent_branchId_createdAt_idx" ON "BranchSettlementEvent"("branchId", "createdAt");
CREATE INDEX "BranchSettlementEvent_supplierId_idx" ON "BranchSettlementEvent"("supplierId");
CREATE INDEX "BranchSettlementEvent_materialOrderId_idx" ON "BranchSettlementEvent"("materialOrderId");
CREATE INDEX "BranchSettlementEvent_paymentIntentId_idx" ON "BranchSettlementEvent"("paymentIntentId");
CREATE INDEX "BranchSettlementEvent_eventType_idx" ON "BranchSettlementEvent"("eventType");
CREATE INDEX "BranchSettlementEvent_settlementStatus_idx" ON "BranchSettlementEvent"("settlementStatus");

-- Backfill existing paid material orders: settlement not supported until gateway integrated
UPDATE "MaterialOrder"
SET "settlementStatus" = 'NOT_SUPPORTED',
    "settlementAmount" = "supplierEarning"
WHERE "paymentStatus" = 'paid'
  AND "settlementStatus" = 'NOT_APPLICABLE';

UPDATE "PaymentIntent"
SET "branchSettlementStatus" = 'NOT_SUPPORTED',
    "branchId" = mo."branchId"
FROM "MaterialOrder" mo
WHERE "PaymentIntent"."materialOrderId" = mo."id"
  AND "PaymentIntent"."kind" IN ('MATERIAL_ORDER', 'DELIVERY_FEE')
  AND "PaymentIntent"."state" = 'PAID'
  AND "PaymentIntent"."branchSettlementStatus" = 'NOT_APPLICABLE';
