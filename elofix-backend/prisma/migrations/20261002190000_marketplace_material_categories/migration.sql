-- Additive marketplace material categories and optional public website URLs.
-- Does not delete or rewrite suppliers, branches, products, orders, payments, or BranchInventoryCategory.

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT;

CREATE TABLE IF NOT EXISTS "MarketplaceMaterialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketplaceMaterialCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceMaterialCategory_slug_key" ON "MarketplaceMaterialCategory"("slug");
CREATE INDEX IF NOT EXISTS "MarketplaceMaterialCategory_isActive_sortOrder_idx" ON "MarketplaceMaterialCategory"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "BranchMarketplaceCategory" (
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchMarketplaceCategory_pkey" PRIMARY KEY ("branchId","categoryId")
);

CREATE INDEX IF NOT EXISTS "BranchMarketplaceCategory_categoryId_idx" ON "BranchMarketplaceCategory"("categoryId");

DO $$ BEGIN
  ALTER TABLE "BranchMarketplaceCategory"
    ADD CONSTRAINT "BranchMarketplaceCategory_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BranchMarketplaceCategory"
    ADD CONSTRAINT "BranchMarketplaceCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "MarketplaceMaterialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
