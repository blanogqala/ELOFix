-- CreateTable (idempotent — table may exist from prior partial apply)
CREATE TABLE IF NOT EXISTS "JobDisputeRound" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "requestedResolution" "DisputeRequestedResolution" NOT NULL,
    "customerComment" TEXT NOT NULL,
    "otherResolutionDetail" TEXT,
    "customerImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerVideos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerComment" TEXT,
    "providerImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerVideos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolutionAction" "DisputeResolutionAction",
    "resolutionNotes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "JobDisputeRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobDisputeRound_disputeId_roundNumber_key" ON "JobDisputeRound"("disputeId", "roundNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobDisputeRound_disputeId_openedAt_idx" ON "JobDisputeRound"("disputeId", "openedAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "JobDisputeRound" ADD CONSTRAINT "JobDisputeRound_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "JobDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
