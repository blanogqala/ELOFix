/**
 * Repair jobs where customer confirmed completion or DB status is COMPLETED
 * but meta.statusOverride was downgraded (e.g. by a later material payment).
 *
 * Run: node scripts/repair-completed-job-meta.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const { normalizeMeta } = require("../src/services/jobMeta.service");

async function main() {
  const jobs = await prisma.job.findMany({
    select: { id: true, status: true, meta: true },
  });

  let repaired = 0;
  for (const job of jobs) {
    const meta = normalizeMeta(job.meta);
    const dbCompleted = String(job.status) === "COMPLETED";
    const userConfirmed = meta.completionConfirmedByUser === true;
    if (!dbCompleted && !userConfirmed) continue;

    const overrideOk = meta.statusOverride === "COMPLETED";
    const stepOk = Number(meta.progressStep) >= 5;
    if (overrideOk && stepOk) continue;

    const nextMeta = {
      ...meta,
      statusOverride: "COMPLETED",
      progressStep: Math.max(Number(meta.progressStep) || 0, 5),
    };
    if (userConfirmed || dbCompleted) {
      nextMeta.completionConfirmedByUser = true;
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        meta: nextMeta,
      },
    });
    repaired += 1;
    console.log(`Repaired job ${job.id}`);
  }

  console.log(`Done. Repaired ${repaired} job(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
