-- Idempotent repair when _prisma_migrations is ahead of actual schema (partial DB / restore drift).

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "laborPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "paymentReleased" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderName" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderRole" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_senderId_idx" ON "Notification"("senderId");

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CategorySuggestion" ADD COLUMN IF NOT EXISTS "providerId" TEXT;
CREATE INDEX IF NOT EXISTS "CategorySuggestion_providerId_idx" ON "CategorySuggestion"("providerId");

DO $$ BEGIN
  ALTER TABLE "CategorySuggestion" ADD CONSTRAINT "CategorySuggestion_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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

DO $$ BEGIN
  ALTER TABLE "ProviderWithdrawalProfile" ADD CONSTRAINT "ProviderWithdrawalProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WithdrawalRequest_providerId_idx" ON "WithdrawalRequest"("providerId");

DO $$ BEGIN
  ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WithdrawalRequest" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WithdrawalRequest_idempotencyKey_key" ON "WithdrawalRequest"("idempotencyKey");
ALTER TABLE "WithdrawalRequest" ALTER COLUMN "status" SET DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_createdAt_idx" ON "WithdrawalRequest"("createdAt");
