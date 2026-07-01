/**
 * One-off repair: cancel PENDING courier child jobs whose material order no longer uses provider delivery.
 *
 * Run: node scripts/repair-stale-courier-jobs.js
 */
require("dotenv").config();

async function main() {
  const materialOrderService = require("../src/services/materialOrder.service");
  const limit = Number(process.argv[2]) || 200;
  const result = await materialOrderService.repairAllStaleCourierJobs({ limit });
  console.log(`repair-stale-courier-jobs: repaired ${result.repaired} order(s)`);
  if (result.repairedIds?.length) {
    console.log(result.repairedIds.join(", "));
  }
  const prisma = require("../src/config/prisma");
  await prisma.$disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
