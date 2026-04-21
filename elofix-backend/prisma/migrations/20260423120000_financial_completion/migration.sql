-- Idempotency records for mandatory financial idempotency
CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_idempotencyKey_key" ON "IdempotencyRecord"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- Non-negative earning amounts
ALTER TABLE "Earning" DROP CONSTRAINT IF EXISTS "Earning_amount_non_negative";
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_amount_non_negative" CHECK ("amount" >= 0);
