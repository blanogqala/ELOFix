-- DeliveryRequest model, optional TrackingSession.orderId, provider vehicle fields

ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "vehicleType" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "numberPlate" TEXT;

CREATE TABLE IF NOT EXISTS "DeliveryRequest" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "courierId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'direct',
  "materialOrderId" TEXT,
  "jobId" TEXT,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "items" JSONB NOT NULL,
  "collectionPoint" JSONB NOT NULL,
  "destinationPoint" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_quote',
  "quotedFee" DECIMAL(12,2),
  "quoteNote" TEXT,
  "fulfillmentStatus" "MaterialFulfillmentStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRequest_materialOrderId_key" ON "DeliveryRequest"("materialOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryRequest_customerId_idx" ON "DeliveryRequest"("customerId");
CREATE INDEX IF NOT EXISTS "DeliveryRequest_courierId_idx" ON "DeliveryRequest"("courierId");
CREATE INDEX IF NOT EXISTS "DeliveryRequest_status_idx" ON "DeliveryRequest"("status");
CREATE INDEX IF NOT EXISTS "DeliveryRequest_createdAt_idx" ON "DeliveryRequest"("createdAt");

ALTER TABLE "TrackingSession" ALTER COLUMN "orderId" DROP NOT NULL;

ALTER TABLE "TrackingSession" ADD COLUMN IF NOT EXISTS "deliveryRequestId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TrackingSession_deliveryRequestId_fkey'
  ) THEN
    ALTER TABLE "TrackingSession"
      ADD CONSTRAINT "TrackingSession_deliveryRequestId_fkey"
      FOREIGN KEY ("deliveryRequestId") REFERENCES "DeliveryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TrackingSession_deliveryRequestId_idx" ON "TrackingSession"("deliveryRequestId");
CREATE INDEX IF NOT EXISTS "TrackingSession_deliveryRequestId_isActive_idx" ON "TrackingSession"("deliveryRequestId", "isActive");
