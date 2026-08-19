-- Additive: customer marketplace restriction, payment obligations, legal acceptance history.

CREATE TYPE "CustomerPaymentObligationStatus" AS ENUM ('DUE', 'PAID', 'OVERDUE', 'CANCELLED');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketplaceRestricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketplaceRestrictedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketplaceRestrictedReason" TEXT;

CREATE TABLE IF NOT EXISTS "CustomerPaymentObligation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "disputeId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "CustomerPaymentObligationStatus" NOT NULL DEFAULT 'DUE',
    "source" TEXT NOT NULL DEFAULT 'COMPLETION_WORKFLOW',
    "paidAt" TIMESTAMP(3),
    "reminder7SentAt" TIMESTAMP(3),
    "reminder1SentAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "restrictionAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPaymentObligation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerPaymentObligation_customerId_status_idx" ON "CustomerPaymentObligation"("customerId", "status");
CREATE INDEX IF NOT EXISTS "CustomerPaymentObligation_jobId_status_idx" ON "CustomerPaymentObligation"("jobId", "status");
CREATE INDEX IF NOT EXISTS "CustomerPaymentObligation_dueAt_idx" ON "CustomerPaymentObligation"("dueAt");
CREATE INDEX IF NOT EXISTS "CustomerPaymentObligation_status_dueAt_idx" ON "CustomerPaymentObligation"("status", "dueAt");

ALTER TABLE "CustomerPaymentObligation" ADD CONSTRAINT "CustomerPaymentObligation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPaymentObligation" ADD CONSTRAINT "CustomerPaymentObligation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "LegalAcceptanceEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "termsVersion" TEXT,
    "privacyVersion" TEXT,
    "providerAgreementVersion" TEXT,
    "refundPolicyVersion" TEXT,
    "supplierAgreementVersion" TEXT,
    "supplierParticipationPolicyVersion" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LegalAcceptanceEvent_userId_acceptedAt_idx" ON "LegalAcceptanceEvent"("userId", "acceptedAt");

ALTER TABLE "LegalAcceptanceEvent" ADD CONSTRAINT "LegalAcceptanceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
