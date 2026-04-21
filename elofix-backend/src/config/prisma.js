const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const globalForPrisma = globalThis;

function poolSslFromConnectionString(connectionString) {
  if (process.env.DATABASE_SSL_DISABLE === "1" || process.env.DATABASE_SSL_DISABLE === "true") {
    return false;
  }
  try {
    const normalized = connectionString.replace(/^postgresql:/i, "postgres:");
    const u = new URL(normalized);
    const mode = (u.searchParams.get("sslmode") || "").toLowerCase();
    if (mode === "disable" || mode === "prefer") {
      return false;
    }
    if (["require", "verify-ca", "verify-full", "no-verify"].includes(mode)) {
      return { rejectUnauthorized: mode === "verify-full" || mode === "verify-ca" };
    }
  } catch {
    /* fall through */
  }
  if (process.env.DATABASE_SSL === "1" || process.env.DATABASE_SSL === "true") {
    return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" };
  }
  return false;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const ssl = poolSslFromConnectionString(connectionString);
  const pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30_000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 10_000,
    ...(ssl ? { ssl } : {}),
  });

  pool.on("error", (err) => {
    console.error("[pg Pool error]", err);
  });

  const adapter = new PrismaPg(pool);

  const log =
    process.env.PRISMA_LOG_QUERIES === "1"
      ? [
          { emit: "stdout", level: "query" },
          { emit: "stdout", level: "error" },
          { emit: "stdout", level: "warn" },
        ]
      : process.env.NODE_ENV === "development"
        ? [{ emit: "stdout", level: "error" }, { emit: "stdout", level: "warn" }]
        : [{ emit: "stdout", level: "error" }];

  return new PrismaClient({ adapter, log });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;

module.exports = prisma;
