const prisma = require("../config/prisma");
const { aggregateRevenueFromJobs, roundMoney } = require("../utils/jobPaidAmount.util");
const { sumJobFinancials } = require("../utils/jobFinancials.util");
const {
  MS_PER_DAY,
  parseDate,
  eachDayInRange,
  normalizeRoleFilter,
  buildJobWhereClause,
  buildDaySeries,
  buildDisputesByDay,
  buildCommissionByDay,
  pctDelta,
} = require("../utils/adminAnalytics.util");

async function computeSummaryCounts() {
  const providerBase = { deletedAt: null, blocked: false };

  const [
    totalCustomers,
    totalProviders,
    verifiedProviders,
    pendingVerification,
    totalSuppliers,
    openDisputes,
    reviewAgg,
    providerRatingAgg,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "CUSTOMER", deletedAt: null } }),
    prisma.provider.count({ where: { deletedAt: null } }),
    prisma.provider.count({ where: { ...providerBase, approved: true } }),
    prisma.provider.count({
      where: {
        deletedAt: null,
        blocked: false,
        approved: false,
        profileCompleted: true,
      },
    }),
    prisma.supplier.count(),
    prisma.jobDispute.count({ where: { status: "OPEN" } }),
    prisma.providerReview.aggregate({ _avg: { rating: true }, _count: { rating: true } }),
    prisma.provider.aggregate({
      where: { deletedAt: null, totalReviews: { gt: 0 } },
      _avg: { rating: true },
      _sum: { totalReviews: true },
    }),
  ]);

  let averageRating = 0;
  if (reviewAgg._count.rating > 0 && reviewAgg._avg.rating != null) {
    averageRating = roundMoney(Number(reviewAgg._avg.rating));
  } else if (providerRatingAgg._sum.totalReviews > 0 && providerRatingAgg._avg.rating != null) {
    averageRating = roundMoney(Number(providerRatingAgg._avg.rating));
  }

  return {
    totalCustomers,
    totalProviders,
    verifiedProviders,
    pendingVerification,
    totalSuppliers,
    openDisputes,
    averageRating,
  };
}

async function computeActiveUsers(fromDay, rangeEndExclusive) {
  const links = await prisma.deviceUserLink.findMany({
    where: {
      lastLoginAt: { gte: fromDay, lt: rangeEndExclusive },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  if (links.length > 0) return links.length;

  const auditLogins = await prisma.auditLog.findMany({
    where: {
      action: "auth.login.success",
      createdAt: { gte: fromDay, lt: rangeEndExclusive },
      userId: { not: null },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return auditLogins.length;
}

async function computeEscrowBalance(jobWhere) {
  const jobs = await prisma.job.findMany({
    where: {
      ...jobWhere,
      laborPaid: true,
    },
    select: {
      meta: true,
      laborPaid: true,
      price: true,
      totalPrice: true,
      providerAmount: true,
      releasedAmount: true,
      paymentReleased: true,
    },
    take: 10000,
  });
  return sumJobFinancials(jobs).remainingInEscrow;
}

async function getAnalyticsForRange(query, fromDay, toDay) {
  const dayKeys = eachDayInRange(fromDay, toDay);
  const rangeEndExclusive = new Date(toDay.getTime() + MS_PER_DAY);
  const jobWhere = buildJobWhereClause(query);
  const roleFilter = normalizeRoleFilter(query.role);

  const dateRange = { gte: fromDay, lt: rangeEndExclusive };
  const jobsInRangeWhere = { ...jobWhere, createdAt: dateRange };

  const [
    jobsInRange,
    customerUsers,
    providerUsers,
    supplierRows,
    pendingVerificationUsers,
    activeProviderCount,
    revenueJobRows,
    ledgerInRange,
    materialOrdersInRange,
    disputesInRange,
    escrowBalance,
    activeUsers,
    summaryCounts,
  ] = await Promise.all([
    prisma.job.findMany({
      where: jobsInRangeWhere,
      select: { createdAt: true },
    }),
    roleFilter === "PROVIDER" || roleFilter === "SUPPLIER"
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { role: "CUSTOMER", createdAt: dateRange, deletedAt: null },
          select: { createdAt: true },
        }),
    roleFilter === "CUSTOMER" || roleFilter === "SUPPLIER"
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { role: "PROVIDER", createdAt: dateRange, deletedAt: null },
          select: { createdAt: true },
        }),
    roleFilter === "CUSTOMER" || roleFilter === "PROVIDER"
      ? Promise.resolve([])
      : prisma.supplier.findMany({
          where: { createdAt: dateRange },
          select: { createdAt: true },
        }),
    prisma.user.findMany({
      where: {
        role: "PROVIDER",
        createdAt: dateRange,
        deletedAt: null,
        providerProfile: {
          approved: false,
          profileCompleted: true,
          blocked: false,
          deletedAt: null,
        },
      },
      select: { createdAt: true },
    }),
    prisma.provider.count({
      where: { approved: true, blocked: false, deletedAt: null },
    }),
    prisma.job.findMany({
      where: jobWhere,
      select: {
        meta: true,
        laborPaid: true,
        totalPrice: true,
        price: true,
        createdAt: true,
      },
    }),
    prisma.commissionLedger.findMany({
      where: { createdAt: dateRange },
      select: { amount: true, createdAt: true },
    }),
    prisma.materialOrder.findMany({
      where: { paymentStatus: "paid", createdAt: dateRange },
      select: { platformCommission: true, createdAt: true },
    }),
    prisma.jobDispute.findMany({
      where: {
        OR: [
          { openedAt: dateRange },
          { resolvedAt: { gte: fromDay, lt: rangeEndExclusive } },
        ],
      },
      select: { openedAt: true, resolvedAt: true, status: true },
    }),
    computeEscrowBalance(jobWhere),
    computeActiveUsers(fromDay, rangeEndExclusive),
    computeSummaryCounts(),
  ]);

  const jobsByDay = buildDaySeries(dayKeys, jobsInRange);
  const customersByDay = buildDaySeries(dayKeys, customerUsers);
  const providersByDay = buildDaySeries(dayKeys, providerUsers);
  const suppliersByDay = buildDaySeries(dayKeys, supplierRows);
  const verificationQueueByDay = buildDaySeries(dayKeys, pendingVerificationUsers);
  const disputesByDay = buildDisputesByDay(dayKeys, disputesInRange);
  const revenueByDay = aggregateRevenueFromJobs(revenueJobRows, dayKeys);
  const commissionByDay = buildCommissionByDay(dayKeys, ledgerInRange, materialOrdersInRange, roundMoney);

  const totalJobs = jobsInRange.length;
  const totalRevenue = revenueByDay.reduce((s, x) => s + x.amount, 0);
  const totalProviderSignups = providerUsers.length;
  const totalLaborCommission = ledgerInRange.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );
  const totalMaterialCommission = materialOrdersInRange.reduce(
    (sum, row) => sum + (Number(row.platformCommission) || 0),
    0
  );
  const totalCommission = roundMoney(totalLaborCommission + totalMaterialCommission);
  const disputesOpenedInRange = disputesInRange.filter(
    (d) => d.openedAt >= fromDay && d.openedAt < rangeEndExclusive
  ).length;

  return {
    from: dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
    jobsByDay,
    revenueByDay,
    providersByDay,
    customersByDay,
    suppliersByDay,
    disputesByDay,
    verificationQueueByDay,
    commissionByDay,
    summary: {
      totalJobs,
      totalRevenue: roundMoney(totalRevenue),
      totalProviderSignupsInRange: totalProviderSignups,
      activeApprovedProviders: activeProviderCount,
      totalLaborCommission: roundMoney(totalLaborCommission),
      totalMaterialCommission: roundMoney(totalMaterialCommission),
      totalCommission,
      totalCustomers: summaryCounts.totalCustomers,
      totalProviders: summaryCounts.totalProviders,
      verifiedProviders: summaryCounts.verifiedProviders,
      pendingVerification: summaryCounts.pendingVerification,
      totalSuppliers: summaryCounts.totalSuppliers,
      openDisputes: summaryCounts.openDisputes,
      disputesOpenedInRange,
      averageRating: summaryCounts.averageRating,
      activeUsers,
      escrowBalance,
    },
  };
}

async function getAnalytics(query = {}) {
  const to = parseDate(query.to) || new Date();
  const from = parseDate(query.from) || new Date(to.getTime() - 29 * MS_PER_DAY);
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  const rangeMs = toDay.getTime() - fromDay.getTime() + MS_PER_DAY;
  const priorToDay = new Date(fromDay.getTime() - MS_PER_DAY);
  const priorFromDay = new Date(priorToDay.getTime() - rangeMs + MS_PER_DAY);

  const [current, prior] = await Promise.all([
    getAnalyticsForRange(query, fromDay, toDay),
    getAnalyticsForRange(query, priorFromDay, priorToDay),
  ]);

  const deltas = {
    totalJobs: pctDelta(current.summary.totalJobs, prior.summary.totalJobs, roundMoney),
    totalRevenue: pctDelta(current.summary.totalRevenue, prior.summary.totalRevenue, roundMoney),
    totalCommission: pctDelta(current.summary.totalCommission, prior.summary.totalCommission, roundMoney),
    totalCustomers: pctDelta(current.summary.totalCustomers, prior.summary.totalCustomers, roundMoney),
    totalProviders: pctDelta(current.summary.totalProviders, prior.summary.totalProviders, roundMoney),
    activeUsers: pctDelta(current.summary.activeUsers, prior.summary.activeUsers, roundMoney),
    disputesOpenedInRange: pctDelta(
      current.summary.disputesOpenedInRange,
      prior.summary.disputesOpenedInRange,
      roundMoney
    ),
  };

  return {
    ...current,
    summary: {
      ...current.summary,
      deltas,
    },
  };
}

module.exports = {
  getAnalytics,
  buildJobWhereClause,
  pctDelta: (current, previous) => pctDelta(current, previous, roundMoney),
};
