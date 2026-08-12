/**
 * Drop leftover unique index that blocks DEPOSIT+COMPLETION commission rows.
 * Idempotent. Run: node scripts/drop-commission-jobid-unique.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const prisma = require("../src/config/prisma");

async function main() {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "CommissionLedger_jobId_key"`);
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'CommissionLedger'
  `);
  console.log("CommissionLedger indexes after drop:", indexes.map((r) => r.indexname));
  const stillUnique = indexes.some((r) => r.indexname === "CommissionLedger_jobId_key");
  if (stillUnique) {
    throw new Error("CommissionLedger_jobId_key still present");
  }
  console.log("OK: multi-tranche CommissionLedger enabled");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
