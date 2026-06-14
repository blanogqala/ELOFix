/**
 * Backfill job.meta.servicePayment for courier jobs paid via DeliveryRequest.
 * Safe to run multiple times (skips rows that already have paid servicePayment).
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const paymentService = require("../src/services/payment.service");
const { getJobMeta } = require("../src/services/jobMeta.service");

async function main() {
  const jobs = await prisma.job.findMany({
    where: { laborPaid: true },
    select: {
      id: true,
      customerId: true,
      price: true,
      totalPrice: true,
      laborPaid: true,
      meta: true,
    },
  });

  let fixed = 0;
  for (const job of jobs) {
    const meta = await getJobMeta(job.id);
    if (!meta?.courierFlow) continue;
    const sp = meta.servicePayment;
    if (sp && String(sp.status || "").toLowerCase() === "paid") continue;
    await paymentService.backfillCourierServicePaymentIfMissing(job.id, job, meta);
    fixed += 1;
  }

  console.log(`Backfilled servicePayment on ${fixed} courier job(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
