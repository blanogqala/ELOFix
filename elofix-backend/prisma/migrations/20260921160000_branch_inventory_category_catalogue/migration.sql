-- Non-destructive catalogue metadata for existing BranchInventoryCategory rows.
-- Preserves all existing category keys, products JSON, and unique (branchId, name).

ALTER TABLE "BranchInventoryCategory"
ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "BranchInventoryCategory_branchId_sortOrder_idx"
ON "BranchInventoryCategory"("branchId", "sortOrder");
