-- AlterTable
ALTER TABLE "User" ADD COLUMN "acceptedTerms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "acceptedPrivacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "acceptedProviderAgreement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "acceptedRefundPolicy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "providerAgreementVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "refundPolicyVersion" TEXT;
