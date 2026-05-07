-- Branch + branch-scoped inventory; MaterialOrder.branchId; migrate Supplier rows to default Branch.

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "hasDelivery" BOOLEAN NOT NULL DEFAULT true,
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "products" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Branch_supplierId_idx" ON "Branch"("supplierId");
CREATE INDEX "Branch_supplierId_isActive_idx" ON "Branch"("supplierId", "isActive");
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One default branch per supplier (catalog + geo copied from legacy Supplier row)
INSERT INTO "Branch" ("id", "supplierId", "name", "address", "city", "latitude", "longitude", "hasDelivery", "deliveryFee", "products", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    s."id",
    COALESCE(NULLIF(TRIM(s."branchName"), ''), NULLIF(TRIM(s."name"), ''), 'Main'),
    s."address",
    s."city",
    s."latitude",
    s."longitude",
    s."hasDelivery",
    s."deliveryFee",
    s."products",
    true,
    s."createdAt",
    CURRENT_TIMESTAMP
FROM "Supplier" s;

-- New per-branch categories
CREATE TABLE "BranchInventoryCategory" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchInventoryCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchInventoryCategory_branchId_name_key" ON "BranchInventoryCategory"("branchId", "name");
CREATE INDEX "BranchInventoryCategory_branchId_idx" ON "BranchInventoryCategory"("branchId");

ALTER TABLE "BranchInventoryCategory" ADD CONSTRAINT "BranchInventoryCategory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move categories to the supplier's default branch (same supplierId on Branch)
INSERT INTO "BranchInventoryCategory" ("id", "branchId", "name", "createdAt")
SELECT sic."id", b."id", sic."name", sic."createdAt"
FROM "SupplierInventoryCategory" sic
INNER JOIN "Branch" b ON b."supplierId" = sic."supplierId";

DROP TABLE "SupplierInventoryCategory";

-- MaterialOrder.branchId
ALTER TABLE "MaterialOrder" ADD COLUMN "branchId" TEXT;

UPDATE "MaterialOrder" mo
SET "branchId" = b."id"
FROM "Branch" b
WHERE mo."branchId" IS NULL
AND mo."supplierId" IS NOT NULL
AND b."supplierId" = mo."supplierId";

UPDATE "MaterialOrder" mo
SET "branchId" = b."id"
FROM "Branch" b
WHERE mo."branchId" IS NULL
AND mo."payload"->>'storeId' IS NOT NULL
AND b."supplierId" = mo."payload"->>'storeId';

UPDATE "MaterialOrder" mo
SET "branchId" = b."id"
FROM "Branch" b
WHERE mo."branchId" IS NULL
AND mo."payload"->'materialBatch'->>'supplierId' IS NOT NULL
AND b."supplierId" = mo."payload"->'materialBatch'->>'supplierId';

-- Denormalize supplierId from branch when missing
UPDATE "MaterialOrder" mo
SET "supplierId" = b."supplierId"
FROM "Branch" b
WHERE mo."branchId" = b."id" AND (mo."supplierId" IS NULL OR mo."supplierId" = '');

ALTER TABLE "MaterialOrder" ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX "MaterialOrder_branchId_idx" ON "MaterialOrder"("branchId");
CREATE INDEX "MaterialOrder_branchId_fulfillmentStatus_idx" ON "MaterialOrder"("branchId", "fulfillmentStatus");
CREATE INDEX "MaterialOrder_jobId_branchId_idx" ON "MaterialOrder"("jobId", "branchId");

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
