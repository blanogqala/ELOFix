-- Additive: payout readiness fields on provider bank profile (no settlement changes).
ALTER TABLE "ProviderWithdrawalProfile" ADD COLUMN IF NOT EXISTS "accountType" TEXT;
ALTER TABLE "ProviderWithdrawalProfile" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT;
