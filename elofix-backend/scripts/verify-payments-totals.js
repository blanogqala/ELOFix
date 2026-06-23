/**
 * Smoke-check: Admin Payments provider-share cards include all paid jobs (labor + courier).
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const { normalizeMeta } = require("../src/services/jobMeta.service");

function isPaidProviderJob(job) {
  return job.laborPaid === true;
}

async function main() {
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      laborPaid: true,
      meta: true,
      totalPrice: true,
      commissionAmount: true,
      providerAmount: true,
      releasedAmount: true,
    },
  });

  let totalProviderShare = 0;
  let totalReleased = 0;
  const rows = [];
  const courierRows = [];

  for (const j of jobs) {
    if (!isPaidProviderJob(j)) continue;
    const meta = normalizeMeta(j.meta);
    const provider = Number(j.providerAmount) || 0;
    const released = Number(j.releasedAmount) || 0;
    totalProviderShare += provider;
    totalReleased += released;
    const row = {
      title: String(j.title || "").slice(0, 30),
      status: j.status,
      courier: Boolean(meta.courierFlow),
      provider,
      released,
      held: Math.round((provider - released) * 100) / 100,
    };
    rows.push(row);
    if (meta.courierFlow) {
      courierRows.push(row);
    }
  }

  console.log("All paid provider jobs (labor + courier/delivery/mover):");
  rows.forEach((r) => console.log(" ", JSON.stringify(r)));
  if (courierRows.length > 0) {
    console.log("---");
    console.log("Courier/delivery/mover jobs:");
    courierRows.forEach((r) => console.log(" ", JSON.stringify(r)));
  }
  console.log("---");
  console.log("Payments page cards (expected frontend):");
  console.log("  Total provider share:", Math.round(totalProviderShare * 100) / 100);
  console.log("  Released to providers:", Math.round(totalReleased * 100) / 100);
  console.log("  Held in escrow:", Math.round((totalProviderShare - totalReleased) * 100) / 100);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
