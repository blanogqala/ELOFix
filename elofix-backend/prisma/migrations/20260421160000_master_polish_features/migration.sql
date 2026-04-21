-- Job payment flags (synced from workflow; backfill optional via app)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "laborPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "paymentReleased" BOOLEAN NOT NULL DEFAULT false;

-- Notifications: sender metadata for threaded UI
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderName" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderRole" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_senderId_idx" ON "Notification"("senderId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Category suggestions: optional provider link
ALTER TABLE "CategorySuggestion" ADD COLUMN IF NOT EXISTS "providerId" TEXT;
CREATE INDEX IF NOT EXISTS "CategorySuggestion_providerId_idx" ON "CategorySuggestion"("providerId");
ALTER TABLE "CategorySuggestion" ADD CONSTRAINT "CategorySuggestion_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reviews (one per job)
CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Review_jobId_key" ON "Review"("jobId");
CREATE INDEX IF NOT EXISTS "Review_jobId_idx" ON "Review"("jobId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Provider bank details for withdrawals
CREATE TABLE IF NOT EXISTS "ProviderWithdrawalProfile" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderWithdrawalProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderWithdrawalProfile_providerId_key" ON "ProviderWithdrawalProfile"("providerId");
ALTER TABLE "ProviderWithdrawalProfile" ADD CONSTRAINT "ProviderWithdrawalProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Withdrawal requests
CREATE TABLE IF NOT EXISTS "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WithdrawalRequest_providerId_idx" ON "WithdrawalRequest"("providerId");
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
