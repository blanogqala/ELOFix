-- CreateTable
CREATE TABLE "TrackingSession" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSession_trackingId_key" ON "TrackingSession"("trackingId");

-- CreateIndex
CREATE INDEX "TrackingSession_orderId_idx" ON "TrackingSession"("orderId");

-- CreateIndex
CREATE INDEX "TrackingSession_orderId_isActive_idx" ON "TrackingSession"("orderId", "isActive");

-- AddForeignKey
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaterialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
