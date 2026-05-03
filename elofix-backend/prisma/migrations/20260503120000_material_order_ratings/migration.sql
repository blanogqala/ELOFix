-- AlterTable
ALTER TABLE "Provider" ADD COLUMN "totalReviews" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MaterialOrderRating" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialOrderRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialOrderRating_orderId_key" ON "MaterialOrderRating"("orderId");
CREATE INDEX "MaterialOrderRating_providerId_idx" ON "MaterialOrderRating"("providerId");
CREATE INDEX "MaterialOrderRating_createdAt_idx" ON "MaterialOrderRating"("createdAt");

ALTER TABLE "MaterialOrderRating" ADD CONSTRAINT "MaterialOrderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaterialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialOrderRating" ADD CONSTRAINT "MaterialOrderRating_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
