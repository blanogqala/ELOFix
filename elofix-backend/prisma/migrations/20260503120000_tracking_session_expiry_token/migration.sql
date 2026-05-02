-- AlterTable
ALTER TABLE "TrackingSession" ADD COLUMN "accessToken" TEXT;
ALTER TABLE "TrackingSession" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "TrackingSession" SET "expiresAt" = "createdAt" + INTERVAL '2 hours' WHERE "expiresAt" IS NULL;

ALTER TABLE "TrackingSession" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE UNIQUE INDEX "TrackingSession_accessToken_key" ON "TrackingSession"("accessToken");

CREATE INDEX "TrackingSession_expiresAt_idx" ON "TrackingSession"("expiresAt");
