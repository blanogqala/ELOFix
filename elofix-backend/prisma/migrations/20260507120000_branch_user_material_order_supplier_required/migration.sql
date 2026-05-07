-- BranchUser (branch-level staff); align MaterialOrder.supplierId with Branch.supplierId and enforce NOT NULL.

CREATE TYPE "BranchUserRole" AS ENUM ('MANAGER', 'STAFF');

CREATE TABLE "BranchUser" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "BranchUserRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchUser_email_key" ON "BranchUser"("email");
CREATE INDEX "BranchUser_branchId_idx" ON "BranchUser"("branchId");

ALTER TABLE "BranchUser" ADD CONSTRAINT "BranchUser_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Denormalized supplier org id must match the branch's supplier
UPDATE "MaterialOrder" mo
SET "supplierId" = b."supplierId"
FROM "Branch" b
WHERE mo."branchId" = b."id"
AND (mo."supplierId" IS NULL OR mo."supplierId" <> b."supplierId");

ALTER TABLE "MaterialOrder" DROP CONSTRAINT IF EXISTS "MaterialOrder_supplierId_fkey";

ALTER TABLE "MaterialOrder" ALTER COLUMN "supplierId" SET NOT NULL;

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
