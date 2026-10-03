-- Move marketplace classification from each branch to the supplier.
-- Existing branch assignments are copied as the UNION of categories per supplier.
-- Suppliers, branches, products, orders, payments, and BranchInventoryCategory are not deleted.
-- allMarketplaceCategories stays false; "all categories" is not inferred from the old rows.
-- Rollback would require restoring BranchMarketplaceCategory and copying supplier rows back onto every branch.
-- That rollback is not generated here because a supplier-level union cannot be split back into the original per-branch sets.

ALTER TABLE "Supplier" ADD COLUMN "allMarketplaceCategories" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SupplierMarketplaceCategory" (
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierMarketplaceCategory_pkey" PRIMARY KEY ("supplierId","categoryId")
);

CREATE INDEX "SupplierMarketplaceCategory_categoryId_idx" ON "SupplierMarketplaceCategory"("categoryId");

INSERT INTO "SupplierMarketplaceCategory" ("supplierId", "categoryId")
SELECT DISTINCT b."supplierId", link."categoryId"
FROM "BranchMarketplaceCategory" AS link
INNER JOIN "Branch" AS b ON b."id" = link."branchId"
ON CONFLICT ("supplierId", "categoryId") DO NOTHING;

ALTER TABLE "SupplierMarketplaceCategory"
  ADD CONSTRAINT "SupplierMarketplaceCategory_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierMarketplaceCategory"
  ADD CONSTRAINT "SupplierMarketplaceCategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "MarketplaceMaterialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "BranchMarketplaceCategory";
