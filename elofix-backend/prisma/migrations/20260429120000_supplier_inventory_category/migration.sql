-- CreateTable
CREATE TABLE "SupplierInventoryCategory" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInventoryCategory_supplierId_name_key" ON "SupplierInventoryCategory"("supplierId", "name");

-- CreateIndex
CREATE INDEX "SupplierInventoryCategory_supplierId_idx" ON "SupplierInventoryCategory"("supplierId");

-- AddForeignKey
ALTER TABLE "SupplierInventoryCategory" ADD CONSTRAINT "SupplierInventoryCategory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
