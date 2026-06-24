-- AlterTable
ALTER TABLE "BranchUser" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedPrivacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptedSupplierAgreement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptedSupplierParticipationPolicy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptedTerms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyVersion" TEXT,
ADD COLUMN     "supplierAgreementVersion" TEXT,
ADD COLUMN     "supplierParticipationPolicyVersion" TEXT,
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "DeliveryRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acceptedSupplierAgreement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptedSupplierParticipationPolicy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supplierAgreementVersion" TEXT,
ADD COLUMN     "supplierParticipationPolicyVersion" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" RENAME CONSTRAINT "AuditLog_pkey" TO "audit_logs_pkey";

-- CreateIndex
CREATE INDEX "PaymentIntent_materialOrderId_idx" ON "PaymentIntent"("materialOrderId");

-- RenameForeignKey
ALTER TABLE "audit_logs" RENAME CONSTRAINT "AuditLog_userId_fkey" TO "audit_logs_userId_fkey";
