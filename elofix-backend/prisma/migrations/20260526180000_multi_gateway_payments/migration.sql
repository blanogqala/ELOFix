-- Multi-gateway payment system (PayFast, Payflex, PayJustNow)

CREATE TYPE "PaymentProvider" AS ENUM ('PAYFAST', 'PAYFLEX', 'PAYJUSTNOW');
CREATE TYPE "PaymentIntentKind" AS ENUM ('LABOR', 'MATERIAL_ORDER', 'JOB_STORE_ORDER', 'DELIVERY_FEE');
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');
CREATE TYPE "EscrowStatus" AS ENUM ('NOT_APPLICABLE', 'HELD', 'PARTIALLY_RELEASED', 'FULLY_RELEASED', 'REFUNDED');
CREATE TYPE "ProviderPayoutStatus" AS ENUM ('NOT_APPLICABLE', 'NONE', 'PARTIAL', 'COMPLETE');

CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "merchantReference" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "kind" "PaymentIntentKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "materialOrderId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "state" "PaymentState" NOT NULL DEFAULT 'PENDING',
    "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "providerPayoutStatus" "ProviderPayoutStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "gatewayTransactionId" TEXT,
    "gatewayPayload" JSONB,
    "idempotencyKey" TEXT,
    "returnUrl" TEXT,
    "cancelUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "rawPayload" JSONB,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentIntent_merchantReference_key" ON "PaymentIntent"("merchantReference");
CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentIntent_materialOrderId_key" ON "PaymentIntent"("materialOrderId");
CREATE INDEX "PaymentIntent_jobId_idx" ON "PaymentIntent"("jobId");
CREATE INDEX "PaymentIntent_userId_createdAt_idx" ON "PaymentIntent"("userId", "createdAt");
CREATE INDEX "PaymentIntent_state_idx" ON "PaymentIntent"("state");
CREATE INDEX "PaymentIntent_provider_gatewayTransactionId_idx" ON "PaymentIntent"("provider", "gatewayTransactionId");

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_externalEventId_key" ON "PaymentWebhookEvent"("provider", "externalEventId");
CREATE INDEX "PaymentWebhookEvent_paymentIntentId_idx" ON "PaymentWebhookEvent"("paymentIntentId");

ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_materialOrderId_fkey" FOREIGN KEY ("materialOrderId") REFERENCES "MaterialOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default currency ZAR for commission ledger
ALTER TABLE "CommissionLedger" ALTER COLUMN "currency" SET DEFAULT 'ZAR';

-- Existing paid material orders remain paid; new default is unpaid until gateway confirms
ALTER TABLE "MaterialOrder" ALTER COLUMN "paymentStatus" SET DEFAULT 'unpaid';
