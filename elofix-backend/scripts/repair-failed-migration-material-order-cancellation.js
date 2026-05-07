#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

/**
 * Fixes Prisma P3009 when `20260504140000_material_order_cancellation_financials` is stuck as "failed".
 *
 * 1. Applies the same DDL as that migration, idempotently (safe if partially applied).
 * 2. `prisma migrate resolve --applied` for that migration.
 * 3. `prisma migrate deploy` for any pending migrations.
 *
 * Usage (from elofix-backend):
 *   node scripts/repair-failed-migration-material-order-cancellation.js
 *
 * Requires DATABASE_URL (and optional LOCAL_DATABASE_URL in development — same rules as the app).
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { execSync } = require("child_process");
const { Client } = require("pg");
const path = require("path");
const { resolveDatabaseUrl } = require("../src/config/databaseUrl");

const MIGRATION_NAME = "20260504140000_material_order_cancellation_financials";
const ROOT = path.join(__dirname, "..");

/** Same as prisma/migrations/20260504140000_material_order_cancellation_financials/migration.sql — idempotent. */
const REPAIR_SQL = `
DO $repair$
BEGIN
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "cancelledBy" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "cancellationReason" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "cancelledAt" TIMESTAMP(3);
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "refundStatus" TEXT NOT NULL DEFAULT 'none';
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "refundAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "refundProcessedAt" TIMESTAMP(3);
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "refundReference" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE "MaterialOrder" ADD COLUMN "commissionReversed" DECIMAL(12, 2) NOT NULL DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END
$repair$;

CREATE INDEX IF NOT EXISTS "MaterialOrder_cancelledAt_idx" ON "MaterialOrder"("cancelledAt");
CREATE INDEX IF NOT EXISTS "MaterialOrder_refundStatus_idx" ON "MaterialOrder"("refundStatus");
`;

async function main() {
  const connectionString = resolveDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log(`[repair] Applying idempotent DDL for ${MIGRATION_NAME}…`);
    await client.query(REPAIR_SQL);
    console.log("[repair] DDL OK.");
  } finally {
    await client.end();
  }

  console.log(`[repair] prisma migrate resolve --applied "${MIGRATION_NAME}"`);
  execSync(`npx prisma migrate resolve --applied "${MIGRATION_NAME}"`, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });

  console.log("[repair] prisma migrate deploy");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });

  console.log("[repair] Done. Run: npx prisma generate (if deploy did not already).");
}

main().catch((err) => {
  console.error("[repair] Failed:", err && err.message ? err.message : err);
  process.exit(1);
});
