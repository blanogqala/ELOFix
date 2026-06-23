const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { roundMoney } = require("../utils/jobPaidAmount.util");
const { countJobsByStatus } = require("../utils/jobStatusCounts.util");
const { enrichJob, normalizeMeta } = require("./jobMeta.service");
const { getLedgerSummary } = require("./providerAccount.service");

function sumJobFinancials(jobs) {
  let totalEarnings = 0;
  let releasedByPlatform = 0;
  let remainingInEscrow = 0;

  for (const job of jobs) {
    const e = enrichJob(job, normalizeMeta(job.meta));
    const providerAmount = Number(e.providerAmount);
    const releasedAmount = Number(e.releasedAmount);
    const remainingAmount = Number(e.remainingAmount);

    if (Number.isFinite(providerAmount) && providerAmount >= 0) {
      totalEarnings += providerAmount;
    }
    if (Number.isFinite(releasedAmount) && releasedAmount >= 0) {
      releasedByPlatform += releasedAmount;
    }
    if (Number.isFinite(remainingAmount) && remainingAmount >= 0) {
      remainingInEscrow += remainingAmount;
    } else {
      const net = Number.isFinite(providerAmount) && providerAmount >= 0 ? providerAmount : 0;
      const rel = Number.isFinite(releasedAmount) && releasedAmount >= 0 ? releasedAmount : 0;
      remainingInEscrow += Math.max(0, net - rel);
    }
  }

  return {
    totalEarnings: roundMoney(totalEarnings),
    releasedByPlatform: roundMoney(releasedByPlatform),
    remainingInEscrow: roundMoney(remainingInEscrow),
  };
}

async function getProviderAnalyticsForAdmin(userId) {
  const id = String(userId || "").trim();
  if (!id) {
    throw new AppError("userId is required", 400);
  }

  const provider = await prisma.provider.findUnique({
    where: { userId: id },
    select: { id: true, userId: true, deletedAt: true },
  });
  if (!provider || provider.deletedAt) {
    throw new AppError("Provider not found", 404);
  }

  const [jobs, ledger] = await Promise.all([
    prisma.job.findMany({
      where: { providerId: provider.userId },
      select: {
        id: true,
        status: true,
        meta: true,
        price: true,
        laborPaid: true,
        paymentReleased: true,
        totalPrice: true,
        providerAmount: true,
        commissionAmount: true,
        releasedAmount: true,
      },
    }),
    getLedgerSummary(provider.id),
  ]);

  const rawCounts = countJobsByStatus(jobs);
  const jobCounts = {
    total: rawCounts.total,
    completed: rawCounts.completed,
    active: rawCounts.active,
    pending: rawCounts.open,
    cancelled: rawCounts.cancelled,
    disputed: rawCounts.disputed,
  };

  const financialSums = sumJobFinancials(jobs);

  return {
    jobCounts,
    financial: {
      ...financialSums,
      availableToWithdraw: roundMoney(ledger.available),
    },
  };
}

module.exports = {
  getProviderAnalyticsForAdmin,
};
