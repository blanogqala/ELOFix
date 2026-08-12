-- Allow multiple CommissionLedger rows per job (one per PaymentIntent tranche).
-- Prior migration dropped CONSTRAINT only; original unique was CREATE UNIQUE INDEX.
DROP INDEX IF EXISTS "CommissionLedger_jobId_key";
