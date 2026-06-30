-- Resolve existing duplicate SUBMITTED repayments (keep newest per provider).
UPDATE "ProviderRefundRepayment" AS r
SET
  status = 'REJECTED',
  "reviewedAt" = NOW(),
  "adminNote" = 'Duplicate submission — superseded by newer submission'
WHERE r.status = 'SUBMITTED'
  AND r.id NOT IN (
    SELECT DISTINCT ON ("providerId") id
    FROM "ProviderRefundRepayment"
    WHERE status = 'SUBMITTED'
    ORDER BY "providerId", "createdAt" DESC
  );

CREATE UNIQUE INDEX "ProviderRefundRepayment_one_submitted_per_provider"
ON "ProviderRefundRepayment" ("providerId")
WHERE status = 'SUBMITTED';
