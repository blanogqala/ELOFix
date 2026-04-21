const prisma = require("../config/prisma");

function sumForStatus(rows, statuses) {
  const set = new Set(statuses.map((s) => String(s).toLowerCase()));
  return rows
    .filter((r) => set.has(String(r.status).toLowerCase()))
    .reduce((acc, r) => acc + (Number(r._sum.amount) || 0), 0);
}

/**
 * Platform-wide financial aggregates for admin dashboard.
 *
 * totalPlatformVolume: credits `available` + debits `withdrawn` (throughput through provider ledger).
 */
async function getFinancialSummary() {
  const [creditAvailableSum, debitWithdrawnSum, byWithdrawalStatus] = await Promise.all([
    prisma.earning.aggregate({
      where: { type: "credit", status: "available" },
      _sum: { amount: true },
    }),
    prisma.earning.aggregate({
      where: { type: "debit", status: "withdrawn" },
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.groupBy({
      by: ["status"],
      _sum: { amount: true },
    }),
  ]);

  const releasedToBalance = Number(creditAvailableSum._sum.amount) || 0;
  const paidOut = Number(debitWithdrawnSum._sum.amount) || 0;
  const totalPlatformVolume = releasedToBalance + paidOut;

  const pendingPayouts = sumForStatus(byWithdrawalStatus, ["pending"]);
  const approvedPayouts = sumForStatus(byWithdrawalStatus, ["approved"]);
  const completedPayouts = sumForStatus(byWithdrawalStatus, ["paid"]);

  return {
    totalPlatformVolume,
    breakdown: {
      releasedToBalance,
      paidOutDebits: paidOut,
    },
    totalPendingPayouts: pendingPayouts + approvedPayouts,
    pendingWithdrawalRequests: pendingPayouts,
    approvedWithdrawalRequests: approvedPayouts,
    totalCompletedPayouts: completedPayouts,
  };
}

module.exports = { getFinancialSummary };
