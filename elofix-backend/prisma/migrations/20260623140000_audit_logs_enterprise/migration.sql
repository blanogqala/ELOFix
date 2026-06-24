-- Rename AuditLog table to audit_logs
ALTER TABLE IF EXISTS "AuditLog" RENAME TO "audit_logs";

-- Add enterprise audit columns
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "oldValue" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "newValue" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "deviceFingerprint" TEXT;

-- Backfill existing rows: copy metadata to newValue where absent
UPDATE "audit_logs"
SET "newValue" = "metadata"
WHERE "newValue" IS NULL AND "metadata" IS NOT NULL;

-- Backfill actorType for rows that may have been inserted before default
UPDATE "audit_logs"
SET "actorType" = 'USER'
WHERE "actorType" IS NULL OR "actorType" = '';

-- Rename indexes if they still use old names
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AuditLog_userId_idx') THEN
    ALTER INDEX "AuditLog_userId_idx" RENAME TO "audit_logs_userId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AuditLog_action_idx') THEN
    ALTER INDEX "AuditLog_action_idx" RENAME TO "audit_logs_action_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AuditLog_createdAt_idx') THEN
    ALTER INDEX "AuditLog_createdAt_idx" RENAME TO "audit_logs_createdAt_idx";
  END IF;
END $$;

-- Composite index for entity lookups
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
