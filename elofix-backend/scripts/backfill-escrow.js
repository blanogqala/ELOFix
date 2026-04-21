/**
 * Backfill job meta escrow.heldAmount for jobs where the customer paid (laborPaid)
 * but escrow was missing or zero (legacy data).
 *
 * Usage: node scripts/backfill-escrow.js
 */
require("dotenv").config();
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const { normalizeMeta } = require("../src/services/jobMeta.service");

function amountFromMeta(m) {
  const pay = m.servicePayment;
  if (pay && typeof pay === "object" && pay.status === "paid" && pay.amount != null) {
    const n = Number(pay.amount);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const sp = m.servicePrice;
  if (sp && typeof sp === "object" && sp.amount != null) {
    const n = Number(sp.amount);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

async function main() {
  const jobs = await prisma.job.findMany({ select: { id: true, price: true, meta: true } });
  let updated = 0;

  for (const job of jobs) {
    const raw = normalizeMeta(job.meta);
    if (!raw.laborPaid) continue;
    const esc = raw.escrow && typeof raw.escrow === "object" ? raw.escrow : {};
    const held = Number(esc.heldAmount) || 0;
    if (held > 0) continue;
    const amount = amountFromMeta(raw) || Number(job.price) || 0;
    if (amount <= 0) continue;
    const released = Number(esc.releasedAmount) || 0;
    const nextMeta = normalizeMeta({
      ...raw,
      escrow: { heldAmount: amount, releasedAmount: released },
    });

    await prisma.$transaction(
      async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: { meta: nextMeta },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }
    );
    updated += 1;
  }

  console.log(`Processed ${jobs.length} jobs; updated escrow for ${updated} entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
