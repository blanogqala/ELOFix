-- Upload rate limiting buckets + fraud alert type for repeated upload abuse

ALTER TYPE "FraudAlertType" ADD VALUE IF NOT EXISTS 'UPLOAD_RATE_ABUSE';

CREATE TABLE "upload_rate_buckets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "window_key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_rate_buckets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "upload_rate_violations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_rate_violations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_rate_buckets_user_id_category_window_key_key"
  ON "upload_rate_buckets"("user_id", "category", "window_key");

CREATE INDEX "upload_rate_buckets_user_id_category_idx"
  ON "upload_rate_buckets"("user_id", "category");

CREATE INDEX "upload_rate_violations_user_id_created_at_idx"
  ON "upload_rate_violations"("user_id", "created_at");

ALTER TABLE "upload_rate_buckets"
  ADD CONSTRAINT "upload_rate_buckets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "upload_rate_violations"
  ADD CONSTRAINT "upload_rate_violations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
