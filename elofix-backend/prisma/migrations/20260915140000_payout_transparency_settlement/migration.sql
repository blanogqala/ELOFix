-- Phase D3: additive payout transparency / Paystack settlement reconciliation.
-- Does not rewrite PaymentIntent amounts, commission, or historical payment states.

CREATE TYPE "PayoutSettlementStatus" AS ENUM (
  'NOT_APPLICABLE',
  'NOT_SUPPORTED',
  'PENDING',
  'PROCESSING',
  'SETTLED',
  'FAILED',
  'REVERSED'
);

CREATE TYPE "PayoutRecipientType" AS ENUM (
  'PROVIDER',
  'SUPPLIER_BRANCH',
  'COURIER'
);

CREATE TABLE "GatewayPayoutSettlement" (
  "id" TEXT NOT NULL,
  "gateway" "PaymentProvider" NOT NULL,
  "externalSettlementId" TEXT,
  "recipientType" "PayoutRecipientType" NOT NULL,
  "recipientUserId" TEXT,
  "supplierId" TEXT,
  "branchId" TEXT,
  "subaccountCode" TEXT,
  "status" "PayoutSettlementStatus" NOT NULL DEFAULT 'PENDING',
  "currency" TEXT NOT NULL DEFAULT 'ZAR',
  "grossRecipientShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gatewayFeeAmount" DECIMAL(12,2),
  "expectedBankAmount" DECIMAL(12,2),
  "settlementDate" TIMESTAMP(3),
  "processingAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "gatewayReference" TEXT,
  "failureReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GatewayPayoutSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GatewayPayoutSettlement_gateway_externalSettlementId_key"
  ON "GatewayPayoutSettlement"("gateway", "externalSettlementId");
CREATE INDEX "GatewayPayoutSettlement_status_idx" ON "GatewayPayoutSettlement"("status");
CREATE INDEX "GatewayPayoutSettlement_recipientUserId_idx" ON "GatewayPayoutSettlement"("recipientUserId");
CREATE INDEX "GatewayPayoutSettlement_supplierId_idx" ON "GatewayPayoutSettlement"("supplierId");
CREATE INDEX "GatewayPayoutSettlement_branchId_idx" ON "GatewayPayoutSettlement"("branchId");
CREATE INDEX "GatewayPayoutSettlement_subaccountCode_idx" ON "GatewayPayoutSettlement"("subaccountCode");

CREATE TABLE "GatewayPayoutSettlementItem" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "customerAmount" DECIMAL(12,2) NOT NULL,
  "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "recipientGrossShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gatewayFeeAmount" DECIMAL(12,2),
  "expectedBankAmount" DECIMAL(12,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GatewayPayoutSettlementItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GatewayPayoutSettlementItem_settlementId_paymentIntentId_key"
  ON "GatewayPayoutSettlementItem"("settlementId", "paymentIntentId");
CREATE INDEX "GatewayPayoutSettlementItem_paymentIntentId_idx" ON "GatewayPayoutSettlementItem"("paymentIntentId");

CREATE TABLE "GatewayPayoutSettlementEvent" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "fromStatus" "PayoutSettlementStatus",
  "toStatus" "PayoutSettlementStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "notificationDedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GatewayPayoutSettlementEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GatewayPayoutSettlementEvent_settlementId_createdAt_idx"
  ON "GatewayPayoutSettlementEvent"("settlementId", "createdAt");
CREATE INDEX "GatewayPayoutSettlementEvent_notificationDedupeKey_idx"
  ON "GatewayPayoutSettlementEvent"("notificationDedupeKey");

ALTER TABLE "GatewayPayoutSettlementItem"
  ADD CONSTRAINT "GatewayPayoutSettlementItem_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "GatewayPayoutSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GatewayPayoutSettlementItem"
  ADD CONSTRAINT "GatewayPayoutSettlementItem_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GatewayPayoutSettlementEvent"
  ADD CONSTRAINT "GatewayPayoutSettlementEvent_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "GatewayPayoutSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentIntent"
  ADD COLUMN "processorFeeAmount" DECIMAL(12,2),
  ADD COLUMN "expectedBankSettlementAmount" DECIMAL(12,2),
  ADD COLUMN "payoutSettlementStatus" "PayoutSettlementStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "payoutSettlementId" TEXT;

CREATE INDEX "PaymentIntent_payoutSettlementStatus_idx" ON "PaymentIntent"("payoutSettlementStatus");
CREATE INDEX "PaymentIntent_payoutSettlementId_idx" ON "PaymentIntent"("payoutSettlementId");

ALTER TABLE "PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_payoutSettlementId_fkey"
  FOREIGN KEY ("payoutSettlementId") REFERENCES "GatewayPayoutSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill truthful payout status. Do not mark SETTLED.
UPDATE "PaymentIntent"
SET "payoutSettlementStatus" = 'NOT_APPLICABLE'
WHERE "kind" = 'PROVIDER_REFUND_REPAYMENT';

UPDATE "PaymentIntent"
SET "payoutSettlementStatus" = 'NOT_SUPPORTED'
WHERE "kind" IN ('LABOR', 'MATERIAL_ORDER', 'JOB_STORE_ORDER', 'DELIVERY_FEE')
  AND "state" = 'PAID'
  AND "provider" <> 'PAYSTACK';

UPDATE "PaymentIntent"
SET "payoutSettlementStatus" = 'PROCESSING'
WHERE "kind" IN ('LABOR', 'MATERIAL_ORDER', 'JOB_STORE_ORDER', 'DELIVERY_FEE')
  AND "state" = 'PAID'
  AND "provider" = 'PAYSTACK';

-- Historical Paystack "SETTLED" used charge transaction ids as settlement ids.
UPDATE "MaterialOrder" AS mo
SET "settlementStatus" = 'PROCESSING',
    "settledAt" = NULL
WHERE mo."settlementStatus" = 'SETTLED'
  AND EXISTS (
    SELECT 1 FROM "PaymentIntent" pi
    WHERE pi."materialOrderId" = mo.id
      AND pi."provider" = 'PAYSTACK'
      AND (
        mo."gatewaySettlementId" IS NULL
        OR mo."gatewaySettlementId" = pi."gatewayTransactionId"
        OR mo."gatewaySettlementId" = pi."merchantReference"
        OR pi."branchSettlementId" = pi."gatewayTransactionId"
        OR pi."branchSettlementId" = pi."merchantReference"
      )
  );

UPDATE "PaymentIntent"
SET "branchSettlementStatus" = 'PROCESSING'
WHERE "branchSettlementStatus" = 'SETTLED'
  AND "provider" = 'PAYSTACK'
  AND (
    "branchSettlementId" IS NULL
    OR "branchSettlementId" = "gatewayTransactionId"
    OR "branchSettlementId" = "merchantReference"
  );

UPDATE "BranchSettlementEvent" AS ev
SET "settlementStatus" = 'PROCESSING'
WHERE ev."settlementStatus" = 'SETTLED'
  AND EXISTS (
    SELECT 1 FROM "PaymentIntent" pi
    WHERE pi.id = ev."paymentIntentId"
      AND pi."provider" = 'PAYSTACK'
      AND (
        ev."gatewaySettlementId" IS NULL
        OR ev."gatewaySettlementId" = pi."gatewayTransactionId"
        OR ev."gatewaySettlementId" = pi."merchantReference"
      )
  );
