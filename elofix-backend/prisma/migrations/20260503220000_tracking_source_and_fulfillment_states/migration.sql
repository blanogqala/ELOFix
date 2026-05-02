-- Material fulfillment terminal / delay states
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE 'FAILED';
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE 'DELAYED';
ALTER TYPE "MaterialFulfillmentStatus" ADD VALUE 'CANCELLED';

-- Tracking source authority (supplier vs provider GPS)
ALTER TABLE "TrackingSession" ADD COLUMN "currentTrackingSource" TEXT NOT NULL DEFAULT 'supplier';
ALTER TABLE "TrackingSession" ADD COLUMN "accessTokenSingleUse" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TrackingSession" ADD COLUMN "accessTokenConsumedAt" TIMESTAMP(3);
