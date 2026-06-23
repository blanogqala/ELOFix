-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisputeRequestedResolution" AS ENUM ('PROVIDER_RETURN_FIX', 'PARTIAL_REFUND', 'FULL_REFUND', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeResolutionAction" AS ENUM ('RELEASE_FUNDS', 'PARTIAL_REFUND', 'FULL_REFUND', 'RETURN_PROVIDER', 'CLOSE_CASE');

-- CreateEnum
CREATE TYPE "DisputeSenderRole" AS ENUM ('CUSTOMER', 'PROVIDER', 'ADMIN');

-- CreateTable
CREATE TABLE "JobCompletionEvidence" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rating" INTEGER,
    "review" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "autoCompleted" BOOLEAN NOT NULL DEFAULT false,
    "jobCategory" TEXT NOT NULL DEFAULT 'GENERAL',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentReleasedAt" TIMESTAMP(3),

    CONSTRAINT "JobCompletionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDispute" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "requestedResolution" "DisputeRequestedResolution" NOT NULL,
    "customerComment" TEXT NOT NULL,
    "customerImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerVideos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerComment" TEXT,
    "providerImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerVideos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminNotes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "JobDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "DisputeSenderRole" NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeResolutionLog" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "DisputeResolutionAction" NOT NULL,
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeResolutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTrustScore" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 100,
    "disputeCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "positiveReviews" INTEGER NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "history" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ProviderTrustScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCompletionEvidence_jobId_key" ON "JobCompletionEvidence"("jobId");

-- CreateIndex
CREATE INDEX "JobCompletionEvidence_providerId_idx" ON "JobCompletionEvidence"("providerId");

-- CreateIndex
CREATE INDEX "JobCompletionEvidence_customerId_idx" ON "JobCompletionEvidence"("customerId");

-- CreateIndex
CREATE INDEX "JobCompletionEvidence_confirmedAt_idx" ON "JobCompletionEvidence"("confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobDispute_jobId_key" ON "JobDispute"("jobId");

-- CreateIndex
CREATE INDEX "JobDispute_status_idx" ON "JobDispute"("status");

-- CreateIndex
CREATE INDEX "JobDispute_providerId_idx" ON "JobDispute"("providerId");

-- CreateIndex
CREATE INDEX "JobDispute_customerId_idx" ON "JobDispute"("customerId");

-- CreateIndex
CREATE INDEX "JobDispute_openedAt_idx" ON "JobDispute"("openedAt");

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_createdAt_idx" ON "DisputeMessage"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "DisputeResolutionLog_disputeId_idx" ON "DisputeResolutionLog"("disputeId");

-- CreateIndex
CREATE INDEX "DisputeResolutionLog_adminId_idx" ON "DisputeResolutionLog"("adminId");

-- CreateIndex
CREATE INDEX "DisputeResolutionLog_createdAt_idx" ON "DisputeResolutionLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderTrustScore_providerId_key" ON "ProviderTrustScore"("providerId");

-- CreateIndex
CREATE INDEX "ProviderTrustScore_score_idx" ON "ProviderTrustScore"("score");

-- AddForeignKey
ALTER TABLE "JobCompletionEvidence" ADD CONSTRAINT "JobCompletionEvidence_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobDispute" ADD CONSTRAINT "JobDispute_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "JobDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeResolutionLog" ADD CONSTRAINT "DisputeResolutionLog_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "JobDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTrustScore" ADD CONSTRAINT "ProviderTrustScore_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
