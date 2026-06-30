-- CreateTable
CREATE TABLE "BranchWithdrawalProfile" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "bankAccountHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchWithdrawalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchWithdrawalRequest" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchWithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchWithdrawalProfile_branchId_key" ON "BranchWithdrawalProfile"("branchId");

-- CreateIndex
CREATE INDEX "BranchWithdrawalProfile_bankAccountHash_idx" ON "BranchWithdrawalProfile"("bankAccountHash");

-- CreateIndex
CREATE UNIQUE INDEX "BranchWithdrawalRequest_idempotencyKey_key" ON "BranchWithdrawalRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BranchWithdrawalRequest_branchId_idx" ON "BranchWithdrawalRequest"("branchId");

-- CreateIndex
CREATE INDEX "BranchWithdrawalRequest_status_idx" ON "BranchWithdrawalRequest"("status");

-- CreateIndex
CREATE INDEX "BranchWithdrawalRequest_createdAt_idx" ON "BranchWithdrawalRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "BranchWithdrawalProfile" ADD CONSTRAINT "BranchWithdrawalProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchWithdrawalRequest" ADD CONSTRAINT "BranchWithdrawalRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
