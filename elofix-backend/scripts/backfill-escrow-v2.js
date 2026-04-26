/**
 * Backfill Job financial fields + CommissionLedger from legacy job.meta.escrow / servicePayment.
 * Run: node scripts/backfill-escrow-v2.js
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const { normalizeMeta } = require("../src/services/jobMeta.service");
const { splitLaborTotalGross } = require("../src/services/payment.service");

function toDecimal(n) {
  return new Prisma.Decimal(String(n));
}

async function main() {
  const jobs = await prisma.job.findMany({
    where: { laborPaid: true },
  });

  let updated = 0;
  for (const job of jobs) {
    const meta = normalizeMeta(job.meta);
    const total =
      job.totalPrice != null
        ? Number(job.totalPrice)
        : Number(meta.servicePayment?.amount || meta.servicePrice?.amount || job.price) || 0;
    if (total <= 0) continue;

    const releasedMeta = Number(meta.escrow?.releasedAmount) || 0;
    const { commissionAmount, providerAmount } = splitLaborTotalGross(toDecimal(total));
    const prov = Number(providerAmount);
    const wasFullRelease = Boolean(job.paymentReleased) && releasedMeta >= prov * 0.99;
    const releasedProv = wasFullRelease ? prov : Math.min(releasedMeta, prov);
    const secondDone = Boolean(job.escrowSecondReleaseDone) || wasFullRelease;

    const nextData = {
      totalPrice: toDecimal(total),
      providerAmount,
      commissionAmount,
      releasedAmount: toDecimal(releasedProv),
      isFullyReleased: secondDone,
      paymentReleased: secondDone,
      escrowSecondReleaseDone: secondDone,
    };

    const existing = await prisma.commissionLedger.findUnique({ where: { jobId: job.id } });
    if (!existing) {
      await prisma.commissionLedger.create({
        data: {
          id: randomUUID(),
          jobId: job.id,
          amount: commissionAmount,
          source: "labor_payment",
          totalPrice: toDecimal(total),
          currency: process.env.PAYSTACK_CURRENCY || "NGN",
        },
      });
    }

    await prisma.job.update({ where: { id: job.id }, data: nextData });
    updated += 1;
  }

  console.log(`Backfill complete: ${updated} jobs.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
