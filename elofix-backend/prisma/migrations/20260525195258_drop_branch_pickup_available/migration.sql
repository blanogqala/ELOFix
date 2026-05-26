/*
  Warnings:

  - You are about to drop the column `description` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the column `pickupAvailable` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the column `bannerImage` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the `BranchOperatingHours` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryMovement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BranchOperatingHours" DROP CONSTRAINT "BranchOperatingHours_branchId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_branchId_fkey";

-- DropIndex
DROP INDEX "Branch_city_idx";

-- DropIndex
DROP INDEX "MaterialOrder_branchId_createdAt_idx";

-- AlterTable
ALTER TABLE "Branch" DROP COLUMN "description",
DROP COLUMN "pickupAvailable";

-- AlterTable
ALTER TABLE "ProviderReview" RENAME CONSTRAINT "Review_pkey" TO "ProviderReview_pkey";

-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "bannerImage";

-- DropTable
DROP TABLE "BranchOperatingHours";

-- DropTable
DROP TABLE "InventoryMovement";

-- RenameForeignKey
ALTER TABLE "ProviderReview" RENAME CONSTRAINT "Review_jobId_fkey" TO "ProviderReview_jobId_fkey";

-- RenameIndex
ALTER INDEX "Review_jobId_idx" RENAME TO "ProviderReview_jobId_idx";

-- RenameIndex
ALTER INDEX "Review_jobId_key" RENAME TO "ProviderReview_jobId_key";
