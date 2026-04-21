-- Idempotent repair: environments where Job.laborPaid is missing (schema drift / partial DB).
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "laborPaid" BOOLEAN NOT NULL DEFAULT false;
