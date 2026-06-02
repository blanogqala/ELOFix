const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { resolveDatabaseUrl, isLocalPostgresHost } = require("./databaseUrl");

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
    const host = (u.hostname || "").toLowerCase();
    if (
      process.env.NODE_ENV === "development" &&
      host &&
      !isLocalPostgresHost(host)
    ) {
      return {
        rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
      };
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
  const connectionString = resolveDatabaseUrl();

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

/** Bump when Prisma schema/client changes so dev servers reload the client (nodemon keeps global). */
const PRISMA_CLIENT_GENERATION = "20260601-courier-fulfillment";

function getPrismaClient() {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaClientGeneration === PRISMA_CLIENT_GENERATION
  ) {
    return globalForPrisma.prisma;
  }
  if (globalForPrisma.prisma?.$disconnect) {
    void globalForPrisma.prisma.$disconnect().catch(() => {});
  }
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaClientGeneration = PRISMA_CLIENT_GENERATION;
  return client;
}

module.exports = getPrismaClient();
