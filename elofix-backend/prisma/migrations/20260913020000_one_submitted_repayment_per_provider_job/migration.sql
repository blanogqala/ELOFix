-- Job-scoped active repayment: a SUBMITTED row on Job A must not block Job B.
-- Keep at most one SUBMITTED repayment per provider + job (NULL jobId is its own bucket).

UPDATE "ProviderRefundRepayment" AS r
SET
  status = 'REJECTED',
  "reviewedAt" = NOW(),
  "adminNote" = 'Duplicate submission — superseded by newer job-scoped submission'
WHERE r.status = 'SUBMITTED'
  AND r.id NOT IN (
    SELECT id FROM (
      SELECT DISTINCT ON ("providerId", COALESCE("jobId", '')) id
      FROM "ProviderRefundRepayment"
      WHERE status = 'SUBMITTED'
      ORDER BY "providerId", COALESCE("jobId", ''), "createdAt" DESC
    ) AS keepers
  );

DROP INDEX IF EXISTS "ProviderRefundRepayment_one_submitted_per_provider";

CREATE UNIQUE INDEX "ProviderRefundRepayment_one_submitted_per_provider_job"
ON "ProviderRefundRepayment" ("providerId", (COALESCE("jobId", '')))
WHERE status = 'SUBMITTED';
