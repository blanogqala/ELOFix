require("dotenv").config();
const fs = require("fs");
const prisma = require("../src/config/prisma");

async function main() {
  const sql = fs.readFileSync(
    "prisma/migrations/20260621120000_job_dispute_rounds/migration.sql",
    "utf8"
  );
  await prisma.$executeRawUnsafe(sql);
  console.log("JobDisputeRound migration applied");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
