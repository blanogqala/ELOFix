ALTER TABLE "Provider" ADD COLUMN "identityType" TEXT NOT NULL DEFAULT 'SA_ID', ADD COLUMN "passportNumber" TEXT, ADD COLUMN "passportNumberHash" TEXT, ADD COLUMN "passportCountry" TEXT;
CREATE UNIQUE INDEX "Provider_passportNumberHash_key" ON "Provider"("passportNumberHash");
