-- Ledger safety: never persist negative amounts
ALTER TABLE "Earning" DROP CONSTRAINT IF EXISTS "Earning_amount_non_negative";
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_amount_non_negative" CHECK (amount >= 0);
