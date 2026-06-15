-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "branchUserId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "supportTargetUserId" TEXT;

-- CreateIndex
CREATE INDEX "Notification_branchUserId_idx" ON "Notification"("branchUserId");
