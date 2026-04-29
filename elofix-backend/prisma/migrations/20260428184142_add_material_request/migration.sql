-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('draft', 'submitted', 'paid');

-- DropIndex
DROP INDEX "Job_isFullyReleased_idx";

-- DropIndex
DROP INDEX "Job_laborPaid_idx";

-- AlterTable
ALTER TABLE "CommissionLedger" ALTER COLUMN "currency" SET DEFAULT 'NGN';

-- AlterTable
ALTER TABLE "PaystackCharge" ALTER COLUMN "amountZar" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialRequest_jobId_idx" ON "MaterialRequest"("jobId");

-- CreateIndex
CREATE INDEX "MaterialRequest_providerId_idx" ON "MaterialRequest"("providerId");

-- CreateIndex
CREATE INDEX "MaterialRequest_status_idx" ON "MaterialRequest"("status");

-- CreateIndex
CREATE INDEX "MaterialRequest_jobId_status_idx" ON "MaterialRequest"("jobId", "status");

-- CreateIndex
CREATE INDEX "MaterialRequest_customerId_idx" ON "MaterialRequest"("customerId");

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
