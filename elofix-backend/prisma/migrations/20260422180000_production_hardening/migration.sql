-- Normalize withdrawal request statuses
UPDATE "WithdrawalRequest" SET status = 'pending' WHERE UPPER(status) = 'PENDING';
UPDATE "WithdrawalRequest" SET status = 'paid' WHERE UPPER(status) = 'PAID';
UPDATE "WithdrawalRequest" SET status = 'failed' WHERE UPPER(status) = 'FAILED';
UPDATE "WithdrawalRequest" SET status = 'approved' WHERE UPPER(status) = 'APPROVED';

-- Flexible conversations: drop composite unique, allow nullable jobId, add type
DROP INDEX IF EXISTS "Conversation_senderId_jobId_key";

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "conversationType" TEXT NOT NULL DEFAULT 'job';
ALTER TABLE "Conversation" ALTER COLUMN "jobId" DROP NOT NULL;

-- Earning: idempotency + withdrawal link + createdAt index
ALTER TABLE "Earning" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Earning" ADD COLUMN IF NOT EXISTS "withdrawalRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Earning_idempotencyKey_key" ON "Earning"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Earning_withdrawalRequestId_key" ON "Earning"("withdrawalRequestId");

ALTER TABLE "Earning" ADD CONSTRAINT "Earning_withdrawalRequestId_fkey"
  FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Earning_createdAt_idx" ON "Earning"("createdAt");

-- At most one pending credit per job per provider
CREATE UNIQUE INDEX IF NOT EXISTS "Earning_one_pending_credit_per_job"
  ON "Earning"("jobId", "providerId")
  WHERE "type" = 'credit' AND "status" = 'pending' AND "jobId" IS NOT NULL;

-- WithdrawalRequest: idempotency + indexes
ALTER TABLE "WithdrawalRequest" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WithdrawalRequest_idempotencyKey_key" ON "WithdrawalRequest"("idempotencyKey");
ALTER TABLE "WithdrawalRequest" ALTER COLUMN "status" SET DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");
CREATE INDEX IF NOT EXISTS "WithdrawalRequest_createdAt_idx" ON "WithdrawalRequest"("createdAt");

-- Audit trail
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Best-effort link legacy withdrawal debits to their request (same provider, amount, close timestamps)
UPDATE "Earning" e
SET "withdrawalRequestId" = w.id
FROM "WithdrawalRequest" w
WHERE e."withdrawalRequestId" IS NULL
  AND e."type" = 'debit'
  AND e."status" = 'withdrawn'
  AND e."jobId" IS NULL
  AND e."providerId" = w."providerId"
  AND e.amount = w.amount
  AND ABS(EXTRACT(EPOCH FROM (e."createdAt" - w."createdAt"))) < 3;
