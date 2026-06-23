/**
 * Smoke-check refund ledger helpers and find a paid cancelled job for manual UI test.
 * Usage: node scripts/verify-refund-system.js
 */
require("dotenv").config();
const prisma = require("../src/config/prisma");
const { getLedgerSummary } = require("../src/services/providerAccount.service");
const { roundMoney, laborGrossFromJob } = require("../src/services/refundJob.service");
const { normalizeMeta } = require("../src/services/jobMeta.service");

async function main() {
  const paidCancelled = await prisma.job.findMany({
    where: { laborPaid: true, status: "CANCELLED" },
    take: 5,
    orderBy: { createdAt: "desc" },
  });

  console.log("=== Paid cancelled jobs (candidates for admin refund) ===");
  for (const job of paidCancelled) {
    const meta = normalizeMeta(job.meta);
    const gross = laborGrossFromJob(job, meta);
    const maxNet = roundMoney(gross * 0.93);
    const refund = meta.refund || {};
    console.log({
      id: job.id,
      title: job.title,
      gross,
      maxNetRefund: maxNet,
      priorRefund: refund.cumulativeCustomerNet ?? refund.amount ?? 0,
      refundStatus: refund.status,
      releasedAmount: Number(job.releasedAmount),
      providerAmount: Number(job.providerAmount),
    });
    if (job.providerId) {
      const providerRow = await prisma.provider.findUnique({
        where: { userId: job.providerId },
        select: { id: true },
      });
      if (providerRow) {
        const ledger = await getLedgerSummary(providerRow.id);
        console.log("  provider ledger:", ledger);
      }
    }
  }

  const debtRows = await prisma.earning.findMany({
    where: { type: "debit", status: "refund_debt" },
    take: 10,
  });
  console.log("\n=== Outstanding refund_debt rows ===", debtRows.length);
  debtRows.forEach((r) =>
    console.log({ providerId: r.providerId, jobId: r.jobId, amount: Number(r.amount) })
  );

  console.log("\nverify-refund-system: OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
