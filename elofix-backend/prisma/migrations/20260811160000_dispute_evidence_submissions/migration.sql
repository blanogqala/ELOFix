-- Append-only dispute evidence submissions (customer / provider).
CREATE TABLE IF NOT EXISTS "DisputeEvidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" "DisputeSenderRole" NOT NULL,
    "comment" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DisputeEvidence_disputeId_createdAt_idx" ON "DisputeEvidence"("disputeId", "createdAt");
CREATE INDEX IF NOT EXISTS "DisputeEvidence_jobId_idx" ON "DisputeEvidence"("jobId");
CREATE INDEX IF NOT EXISTS "DisputeEvidence_authorId_idx" ON "DisputeEvidence"("authorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DisputeEvidence_disputeId_fkey'
  ) THEN
    ALTER TABLE "DisputeEvidence"
      ADD CONSTRAINT "DisputeEvidence_disputeId_fkey"
      FOREIGN KEY ("disputeId") REFERENCES "JobDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
