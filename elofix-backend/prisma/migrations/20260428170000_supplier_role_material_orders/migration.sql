-- CreateEnum
CREATE TYPE "MaterialFulfillmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPPLIER';

-- AlterTable Supplier
ALTER TABLE "Supplier" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "createdByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable MaterialOrder
ALTER TABLE "MaterialOrder" ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "fulfillmentStatus" "MaterialFulfillmentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "materialsSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "platformCommission" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplierEarning" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "MaterialOrder_supplierId_idx" ON "MaterialOrder"("supplierId");

-- CreateIndex
CREATE INDEX "MaterialOrder_supplierId_fulfillmentStatus_idx" ON "MaterialOrder"("supplierId", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX "MaterialOrder_createdAt_idx" ON "MaterialOrder"("createdAt");

-- CreateIndex
CREATE INDEX "Supplier_createdAt_idx" ON "Supplier"("createdAt");

-- AddForeignKey
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
