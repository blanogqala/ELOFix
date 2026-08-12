-- Payout profile lifecycle: gateway fields on provider profiles, soft deactivate on both

ALTER TABLE "ProviderWithdrawalProfile"
  ADD COLUMN "gatewayProvider" "PaymentProvider",
  ADD COLUMN "gatewayRecipientId" TEXT,
  ADD COLUMN "gatewayProfileStatus" TEXT,
  ADD COLUMN "gatewayProfilePayload" JSONB,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

ALTER TABLE "BranchWithdrawalProfile"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE INDEX "ProviderWithdrawalProfile_verificationStatus_idx" ON "ProviderWithdrawalProfile"("verificationStatus");
CREATE INDEX "ProviderWithdrawalProfile_isActive_idx" ON "ProviderWithdrawalProfile"("isActive");
CREATE INDEX "BranchWithdrawalProfile_isActive_idx" ON "BranchWithdrawalProfile"("isActive");

-- Existing profiles with VERIFIED from old local logic should await gateway re-verification
UPDATE "ProviderWithdrawalProfile"
SET "verificationStatus" = 'PENDING_VERIFICATION',
    "gatewayProfileStatus" = COALESCE("gatewayProfileStatus", 'GATEWAY_NOT_CONFIGURED')
WHERE "verificationStatus" = 'VERIFIED'
  AND "gatewayRecipientId" IS NULL;
