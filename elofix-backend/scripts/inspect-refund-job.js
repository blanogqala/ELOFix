require("dotenv").config();
const prisma = require("../src/config/prisma");
const { normalizeMeta, enrichJob } = require("../src/services/jobMeta.service");
const { getLedgerSummary } = require("../src/services/providerAccount.service");

async function main() {
  const j = await prisma.job.findFirst({
    where: { laborPaid: true, status: "CANCELLED" },
    orderBy: { createdAt: "desc" },
  });
  if (!j) {
    console.log("no job");
    return;
  }
  const meta = normalizeMeta(j.meta);
  const e = enrichJob(j, meta);
  console.log(
    JSON.stringify(
      {
        id: j.id,
        refund: meta.refund,
        escrow: meta.escrow,
        remainingAmount: e.remainingAmount,
        refundAmount: e.refundAmount,
        refundStatus: e.refundStatus,
        paymentSettlementStatus: e.paymentSettlementStatus,
        releasedAmount: j.releasedAmount,
        providerAmount: j.providerAmount,
      },
      null,
      2
    )
  );
  if (j.providerId) {
    const p = await prisma.provider.findUnique({ where: { userId: j.providerId } });
    if (p) {
      const ledger = await getLedgerSummary(p.id);
      console.log("provider ledger:", ledger);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
