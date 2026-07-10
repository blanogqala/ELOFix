const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");
const { roundMoney } = require("../utils/jobPaidAmount.util");
const { sumJobFinancials } = require("../utils/jobFinancials.util");
const { countJobsByStatus } = require("../utils/jobStatusCounts.util");
const { getLedgerSummary } = require("./providerAccount.service");

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
