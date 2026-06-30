-- CreateEnum
CREATE TYPE "RefundRecoveryStatus" AS ENUM ('PENDING', 'PARTIALLY_RECOVERED', 'RECOVERED', 'OVERDUE', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "ProviderRefundRepaymentStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "refundDebtBlockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RefundRecovery" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "disputeId" TEXT,
    "totalPending" DECIMAL(12,2) NOT NULL,
    "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "RefundRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "legalActionAt" TIMESTAMP(3),
    "reminder7SentAt" TIMESTAMP(3),
    "reminder1SentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRefundRepayment" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "proofUrl" TEXT,
    "status" "ProviderRefundRepaymentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRefundRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundRecovery_providerId_idx" ON "RefundRecovery"("providerId");

-- CreateIndex
CREATE INDEX "RefundRecovery_customerId_idx" ON "RefundRecovery"("customerId");

-- CreateIndex
CREATE INDEX "RefundRecovery_jobId_idx" ON "RefundRecovery"("jobId");

-- CreateIndex
CREATE INDEX "RefundRecovery_status_idx" ON "RefundRecovery"("status");

-- CreateIndex
CREATE INDEX "RefundRecovery_dueAt_idx" ON "RefundRecovery"("dueAt");

-- CreateIndex
CREATE INDEX "ProviderRefundRepayment_providerId_idx" ON "ProviderRefundRepayment"("providerId");

-- CreateIndex
CREATE INDEX "ProviderRefundRepayment_status_idx" ON "ProviderRefundRepayment"("status");

-- CreateIndex
CREATE INDEX "ProviderRefundRepayment_createdAt_idx" ON "ProviderRefundRepayment"("createdAt");

-- AddForeignKey
ALTER TABLE "RefundRecovery" ADD CONSTRAINT "RefundRecovery_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecovery" ADD CONSTRAINT "RefundRecovery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecovery" ADD CONSTRAINT "RefundRecovery_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "JobDispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRefundRepayment" ADD CONSTRAINT "ProviderRefundRepayment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
