-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isFullyReleased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerAmount" DECIMAL(10,2),
ADD COLUMN     "releasedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalPrice" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "CommissionLedger" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'labor_payment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaystackCharge" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "paystackReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amountZar" DECIMAL(12,2) NOT NULL,
    "refundedZar" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paystackTransId" TEXT,
    "lastRefundMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaystackCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaystackWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaystackWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionLedger_jobId_key" ON "CommissionLedger"("jobId");

-- CreateIndex
CREATE INDEX "CommissionLedger_createdAt_idx" ON "CommissionLedger"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaystackCharge_paystackReference_key" ON "PaystackCharge"("paystackReference");

-- CreateIndex
CREATE INDEX "PaystackCharge_jobId_idx" ON "PaystackCharge"("jobId");

-- CreateIndex
CREATE INDEX "PaystackCharge_status_idx" ON "PaystackCharge"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaystackWebhookEvent_eventId_key" ON "PaystackWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "Conversation_conversationType_idx" ON "Conversation"("conversationType");

-- CreateIndex
CREATE INDEX "Job_laborPaid_idx" ON "Job"("laborPaid");

-- CreateIndex
CREATE INDEX "Job_isFullyReleased_idx" ON "Job"("isFullyReleased");

-- AddForeignKey
ALTER TABLE "CommissionLedger" ADD CONSTRAINT "CommissionLedger_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaystackCharge" ADD CONSTRAINT "PaystackCharge_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
