-- Optional provider quotation attachment on jobs
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quotationFileUrl" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quotationFileName" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quotationUploadedAt" TIMESTAMP(3);
