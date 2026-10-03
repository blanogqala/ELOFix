/**
 * Manual one-time cleanup for leftover local Playwright categories named "E2E Timber …".
 *
 * Usage (from elofix-backend): node scripts/cleanup-e2e-timber-categories.js
 *
 * Refuses production, remote hosts, and any database other than localhost `elofix`.
 * Not called from server startup, deploy, or tests.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { assertSafeE2eDatabase } = require("./e2eMarketplaceFixtureGuard");

function assertLocalElofixOnly(env = process.env) {
  assertSafeE2eDatabase(env);
  const raw = String(env.DATABASE_URL || "").trim();
  const parsed = new URL(raw.replace(/^postgres(ql)?:/i, "http:"));
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("/")[0];
  if (database !== "elofix") {
    throw new Error(`Refusing Timber cleanup on database "${database}". This script only touches localhost elofix.`);
  }
}

async function main() {
  assertLocalElofixOnly();
  const prisma = require("../src/config/prisma");
  try {
    const rows = await prisma.marketplaceMaterialCategory.findMany({
      where: { name: { startsWith: "E2E Timber " } },
      select: { id: true, name: true },
    });
    if (rows.length === 0) {
      process.stderr.write("cleanup-e2e-timber-categories: no E2E Timber rows found\n");
      return;
    }
    const ids = rows.map((row) => row.id);
    await prisma.marketplaceMaterialCategory.deleteMany({ where: { id: { in: ids } } });
    process.stderr.write(
      `cleanup-e2e-timber-categories: removed ${rows.length} categor${rows.length === 1 ? "y" : "ies"}\n`
    );
    for (const row of rows) {
      process.stderr.write(`  ${row.name}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
