-- Notification dedupe keys and delivery outbox

CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('SOCKET', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD');

ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

ALTER TABLE "BranchStaffNotification" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
CREATE UNIQUE INDEX "BranchStaffNotification_branchUserId_dedupeKey_key" ON "BranchStaffNotification"("branchUserId", "dedupeKey");

CREATE TABLE "NotificationDeliveryOutbox" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "channel" "NotificationDeliveryChannel" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationDeliveryOutbox_status_nextAttemptAt_idx" ON "NotificationDeliveryOutbox"("status", "nextAttemptAt");
CREATE INDEX "NotificationDeliveryOutbox_notificationId_idx" ON "NotificationDeliveryOutbox"("notificationId");

ALTER TABLE "NotificationDeliveryOutbox" ADD CONSTRAINT "NotificationDeliveryOutbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
