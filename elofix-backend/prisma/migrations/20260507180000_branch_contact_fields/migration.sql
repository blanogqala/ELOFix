-- Branch public contact (idempotent; may already exist from supplier_branch_enterprise)

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "branchPhone" TEXT;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "branchEmail" TEXT;
