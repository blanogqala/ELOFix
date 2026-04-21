/**
 * One-time: create Earning rows from existing Job.meta escrow + laborPaid for providers.
 * Run: node scripts/backfill-earnings.js
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const { normalizeMeta } = require("../src/services/jobMeta.service");

async function main() {
  const jobs = await prisma.job.findMany({
    where: { laborPaid: true, providerId: { not: null } },
    select: {
      id: true,
      providerId: true,
      meta: true,
      price: true,
    },
  });

  let created = 0;
  for (const job of jobs) {
    const existing = await prisma.earning.count({
      where: { jobId: job.id },
    });
    if (existing > 0) continue;

    const provider = await prisma.provider.findUnique({
      where: { userId: job.providerId },
      select: { id: true },
    });
    if (!provider) continue;

    const meta = normalizeMeta(job.meta);
    const held = Number(meta.escrow?.heldAmount) || 0;
    const released = Number(meta.escrow?.releasedAmount) || 0;
    const laborAmount = meta.servicePrice?.amount || Number(job.price) || 0;

    if (held > 0) {
      await prisma.earning.create({
        data: {
          id: randomUUID(),
          providerId: provider.id,
          jobId: job.id,
          amount: held,
          type: "credit",
          status: "pending",
        },
      });
      created += 1;
    }
    if (released > 0) {
      await prisma.earning.create({
        data: {
          id: randomUUID(),
          providerId: provider.id,
          jobId: job.id,
          amount: released,
          type: "credit",
          status: "available",
        },
      });
      created += 1;
    }
    if (held === 0 && released === 0 && laborAmount > 0) {
      await prisma.earning.create({
        data: {
          id: randomUUID(),
          providerId: provider.id,
          jobId: job.id,
          amount: laborAmount,
          type: "credit",
          status: "pending",
        },
      });
      created += 1;
    }
  }

  console.log(`Backfill done. Created ${created} earning row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
