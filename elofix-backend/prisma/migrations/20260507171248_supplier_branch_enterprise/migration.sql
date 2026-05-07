-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ORDERS', 'DELIVERY', 'INVENTORY', 'SYSTEM', 'REFUNDS', 'STAFF');

-- DropIndex
DROP INDEX "MaterialOrder_cancelledAt_idx";

-- DropIndex
DROP INDEX "MaterialOrder_refundStatus_idx";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "area" TEXT,
ADD COLUMN     "branchEmail" TEXT,
ADD COLUMN     "branchPhone" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "pickupAvailable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "notificationCategory" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "bannerImage" TEXT;

-- CreateTable
CREATE TABLE "BranchOperatingHours" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "openMinutes" INTEGER,
    "closeMinutes" INTEGER,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BranchOperatingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'adjustment',
    "actorBranchUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchStaffNotification" (
    "id" TEXT NOT NULL,
    "branchUserId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "materialOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchStaffNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchOperatingHours_branchId_idx" ON "BranchOperatingHours"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchOperatingHours_branchId_weekday_key" ON "BranchOperatingHours"("branchId", "weekday");

-- CreateIndex
CREATE INDEX "InventoryMovement_branchId_idx" ON "InventoryMovement"("branchId");

-- CreateIndex
CREATE INDEX "InventoryMovement_branchId_createdAt_idx" ON "InventoryMovement"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- CreateIndex
CREATE INDEX "BranchStaffNotification_branchUserId_idx" ON "BranchStaffNotification"("branchUserId");

-- CreateIndex
CREATE INDEX "BranchStaffNotification_branchUserId_createdAt_idx" ON "BranchStaffNotification"("branchUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BranchStaffNotification_category_idx" ON "BranchStaffNotification"("category");

-- CreateIndex
CREATE INDEX "Branch_city_idx" ON "Branch"("city");

-- CreateIndex
CREATE INDEX "MaterialOrder_branchId_createdAt_idx" ON "MaterialOrder"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_notificationCategory_idx" ON "Notification"("notificationCategory");

-- AddForeignKey
ALTER TABLE "BranchOperatingHours" ADD CONSTRAINT "BranchOperatingHours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStaffNotification" ADD CONSTRAINT "BranchStaffNotification_branchUserId_fkey" FOREIGN KEY ("branchUserId") REFERENCES "BranchUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
