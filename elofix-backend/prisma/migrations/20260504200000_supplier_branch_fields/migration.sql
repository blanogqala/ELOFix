-- Branch-level storefront metadata (brand + branch + city filter)
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "brandName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "branchName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "city" TEXT;
