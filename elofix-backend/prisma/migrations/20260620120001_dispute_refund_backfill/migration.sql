-- Backfill legacy customer refund requests to unified REFUND label
-- Separate migration: PostgreSQL requires new enum values to be committed before use.
UPDATE "JobDispute"
SET "requestedResolution" = 'REFUND'
WHERE "requestedResolution" IN ('PARTIAL_REFUND', 'FULL_REFUND');
