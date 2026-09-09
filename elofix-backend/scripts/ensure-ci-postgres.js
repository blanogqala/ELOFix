/**
 * Create a disposable local Postgres database for Phase A clean-install tests.
 * Writes gitignored elofix-backend/.env.ci-phasea (DATABASE_URL only).
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DB_NAME = "elofix_ci_phasea";

function asHttpUrl(databaseUrl) {
  return new URL(String(databaseUrl).replace(/^postgres(ql)?:/i, "http:"));
}

function toPostgresUrl(httpUrl) {
  return httpUrl.toString().replace(/^http:/i, "postgresql:");
}

async function main() {
  const src = process.env.DATABASE_URL;
  if (!src) {
    throw new Error("DATABASE_URL is required");
  }
  const adminUrl = asHttpUrl(src);
  adminUrl.pathname = "/postgres";
  const ciUrl = asHttpUrl(src);
  ciUrl.pathname = `/${DB_NAME}`;

  const admin = new Client({ connectionString: toPostgresUrl(adminUrl) });
  await admin.connect();
  const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (found.rowCount) {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [DB_NAME]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    console.log(`dropped ${DB_NAME}`);
  }
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  console.log(`created ${DB_NAME}`);
  await admin.end();

  const out = path.join(__dirname, "..", ".env.ci-phasea");
  fs.writeFileSync(out, `DATABASE_URL=${toPostgresUrl(ciUrl)}\n`, { encoding: "utf8" });
  console.log("wrote .env.ci-phasea");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
