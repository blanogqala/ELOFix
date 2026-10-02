/**
 * CLI for the Playwright marketplace fixture.
 * Usage (from elofix-backend): node scripts/seed-e2e-marketplace.js
 *
 * Loads backend/.env only for keys that are not already set, so CI DATABASE_URL wins.
 * Refuses NODE_ENV=production and any non-local database.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const prisma = require("../src/config/prisma");
const { seedE2eMarketplaceFixtures } = require("./e2eMarketplaceFixture");

async function main() {
  await seedE2eMarketplaceFixtures(prisma);
  process.stderr.write("seed-e2e-marketplace: Paint, Tiles & Flooring, and fixture branches are ready\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
