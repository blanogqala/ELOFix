const prisma = require("../config/prisma");
const { aggregateRevenueFromJobs } = require("../utils/jobPaidAmount.util");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

function eachDayInRange(from, to) {
  const keys = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    keys.push(dayKey(new Date(t)));
  }
  return keys;
}

async function getAnalytics(query = {}) {
  const to = parseDate(query.to) || new Date();
  const from =
    parseDate(query.from) || new Date(to.getTime() - 29 * MS_PER_DAY);
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const dayKeys = eachDayInRange(fromDay, toDay);
  const rangeEndExclusive = new Date(toDay.getTime() + MS_PER_DAY);

  const [jobsInRange, providerUsers, activeProviderCount, allJobRows, laborCommissionAgg, materialOrdersInRange] =
    await Promise.all([
    prisma.job.findMany({
      where: {
        createdAt: { gte: fromDay, lt: rangeEndExclusive },
      },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: {
        role: "PROVIDER",
        createdAt: { gte: fromDay, lt: rangeEndExclusive },
      },
      select: { createdAt: true },
    }),
    prisma.provider.count({
      where: {
        approved: true,
        blocked: false,
        deletedAt: null,
      },
    }),
    prisma.job.findMany({
      select: {
        meta: true,
        laborPaid: true,
        totalPrice: true,
        price: true,
        createdAt: true,
      },
    }),
    prisma.commissionLedger.aggregate({
      where: { createdAt: { gte: fromDay, lt: rangeEndExclusive } },
      _sum: { amount: true },
    }),
    prisma.materialOrder.findMany({
      where: {
        paymentStatus: "paid",
        fulfillmentStatus: "COMPLETED",
        createdAt: { gte: fromDay, lt: rangeEndExclusive },
      },
      select: { platformCommission: true },
    }),
  ]);

  const jobsByDayMap = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  jobsInRange.forEach((j) => {
    const k = dayKey(j.createdAt);
    if (jobsByDayMap[k] !== undefined) jobsByDayMap[k] += 1;
  });
  const jobsByDay = dayKeys.map((date) => ({ date, count: jobsByDayMap[date] || 0 }));

  const regByDayMap = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  providerUsers.forEach((u) => {
    const k = dayKey(u.createdAt);
    if (regByDayMap[k] !== undefined) regByDayMap[k] += 1;
  });
  const providersByDay = dayKeys.map((date) => ({ date, count: regByDayMap[date] || 0 }));

  const revenueByDay = aggregateRevenueFromJobs(allJobRows, dayKeys);

  const totalJobs = jobsInRange.length;
  const totalRevenue = revenueByDay.reduce((s, x) => s + x.amount, 0);
  const totalProviderSignups = providerUsers.length;

  const totalLaborCommission =
    laborCommissionAgg._sum.amount != null ? Number(laborCommissionAgg._sum.amount) : 0;
  const totalMaterialCommission = materialOrdersInRange.reduce(
    (sum, row) => sum + (Number(row.platformCommission) || 0),
    0
  );
  const totalCommission = Math.round((totalLaborCommission + totalMaterialCommission + Number.EPSILON) * 100) / 100;

  return {
    from: dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
    jobsByDay,
    revenueByDay,
    providersByDay,
    summary: {
      totalJobs,
      totalRevenue: Math.round((totalRevenue + Number.EPSILON) * 100) / 100,
      totalProviderSignupsInRange: totalProviderSignups,
      activeApprovedProviders: activeProviderCount,
      totalLaborCommission: Math.round((totalLaborCommission + Number.EPSILON) * 100) / 100,
      totalMaterialCommission: Math.round((totalMaterialCommission + Number.EPSILON) * 100) / 100,
      totalCommission,
    },
  };
}

module.exports = {
  getAnalytics,
};
