-- AlterTable
ALTER TABLE "MaterialOrder" ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'paid',
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'store_checkout';

-- CreateIndex
CREATE INDEX "MaterialOrder_jobId_idx" ON "MaterialOrder"("jobId");

-- CreateIndex
CREATE INDEX "MaterialOrder_jobId_supplierId_idx" ON "MaterialOrder"("jobId", "supplierId");

-- AddForeignKey
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
