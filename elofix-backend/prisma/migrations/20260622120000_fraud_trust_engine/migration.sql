-- CreateEnum
CREATE TYPE "FraudAlertType" AS ENUM ('DUPLICATE_PHONE', 'DUPLICATE_SA_ID', 'DUPLICATE_COMPANY_REG', 'DUPLICATE_BANK_ACCOUNT', 'SUSPICIOUS_DEVICE', 'HIGH_RISK_PROVIDER', 'FLAGGED_CUSTOMER', 'SUSPICIOUS_LOGIN', 'FAKE_DOCUMENTATION');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudAlertStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProviderFraudReviewStatus" AS ENUM ('NONE', 'PENDING_REVIEW', 'CLEARED', 'REJECTED');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "phoneNormalized" TEXT;

-- AlterTable Provider
ALTER TABLE "Provider" ADD COLUMN "saIdNumber" TEXT;
ALTER TABLE "Provider" ADD COLUMN "saIdNumberHash" TEXT;
ALTER TABLE "Provider" ADD COLUMN "companyRegistrationNumber" TEXT;
ALTER TABLE "Provider" ADD COLUMN "companyRegistrationHash" TEXT;
ALTER TABLE "Provider" ADD COLUMN "fraudReviewStatus" "ProviderFraudReviewStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Provider" ADD COLUMN "bankVerifiedAt" TIMESTAMP(3);

-- AlterTable ProviderWithdrawalProfile
ALTER TABLE "ProviderWithdrawalProfile" ADD COLUMN "bankAccountHash" TEXT;

-- CreateTable FraudAlert
CREATE TABLE "FraudAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "providerId" TEXT,
    "alertType" "FraudAlertType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable DeviceProfile
CREATE TABLE "DeviceProfile" (
    "id" TEXT NOT NULL,
    "browserFingerprint" TEXT,
    "deviceFingerprint" TEXT NOT NULL,
    "ipAddress" TEXT,
    "os" TEXT,
    "country" TEXT,
    "city" TEXT,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable DeviceUserLink
CREATE TABLE "DeviceUserLink" (
    "id" TEXT NOT NULL,
    "deviceProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loginCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DeviceUserLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_saIdNumberHash_key" ON "Provider"("saIdNumberHash");

-- CreateIndex
CREATE INDEX "Provider_companyRegistrationHash_idx" ON "Provider"("companyRegistrationHash");

-- CreateIndex
CREATE INDEX "User_phoneNormalized_idx" ON "User"("phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNormalized_active_key" ON "User"("phoneNormalized") WHERE "deletedAt" IS NULL AND "phoneNormalized" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ProviderWithdrawalProfile_bankAccountHash_idx" ON "ProviderWithdrawalProfile"("bankAccountHash");

-- CreateIndex
CREATE INDEX "FraudAlert_alertType_idx" ON "FraudAlert"("alertType");

-- CreateIndex
CREATE INDEX "FraudAlert_severity_idx" ON "FraudAlert"("severity");

-- CreateIndex
CREATE INDEX "FraudAlert_status_idx" ON "FraudAlert"("status");

-- CreateIndex
CREATE INDEX "FraudAlert_userId_idx" ON "FraudAlert"("userId");

-- CreateIndex
CREATE INDEX "FraudAlert_providerId_idx" ON "FraudAlert"("providerId");

-- CreateIndex
CREATE INDEX "FraudAlert_createdAt_idx" ON "FraudAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceProfile_deviceFingerprint_key" ON "DeviceProfile"("deviceFingerprint");

-- CreateIndex
CREATE INDEX "DeviceProfile_lastSeenAt_idx" ON "DeviceProfile"("lastSeenAt");

-- CreateIndex
CREATE INDEX "DeviceUserLink_userId_idx" ON "DeviceUserLink"("userId");

-- CreateIndex
CREATE INDEX "DeviceUserLink_deviceProfileId_idx" ON "DeviceUserLink"("deviceProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUserLink_deviceProfileId_userId_key" ON "DeviceUserLink"("deviceProfileId", "userId");

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUserLink" ADD CONSTRAINT "DeviceUserLink_deviceProfileId_fkey" FOREIGN KEY ("deviceProfileId") REFERENCES "DeviceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUserLink" ADD CONSTRAINT "DeviceUserLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
