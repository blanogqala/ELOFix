-- Provider-reported job pay range and per-km delivery rate (Rand)

ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "lowestPaidJobRand" DECIMAL(12, 2);
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "highestPaidJobRand" DECIMAL(12, 2);
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "deliveryRatePerKmRand" DECIMAL(12, 2);
