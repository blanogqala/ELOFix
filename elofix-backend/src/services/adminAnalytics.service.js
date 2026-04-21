const prisma = require("../config/prisma");

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

/**
 * Revenue = paid labor (servicePayment) + paid material batches (materialPayments), bucketed by paidAt date (UTC day).
 * @param {object[]} metaList - Job.meta objects from PostgreSQL
 */
function aggregateRevenueFromMeta(metaList, dayKeys) {
  const laborByDay = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  const materialByDay = Object.fromEntries(dayKeys.map((k) => [k, 0]));

  (Array.isArray(metaList) ? metaList : []).forEach((meta) => {
    if (!meta || typeof meta !== "object") return;
    const sp = meta.servicePayment;
    if (sp && sp.status === "paid" && sp.paidAt != null && sp.amount != null) {
      const k = dayKey(new Date(sp.paidAt));
      if (laborByDay[k] !== undefined) {
        laborByDay[k] += Number(sp.amount) || 0;
      }
    }
    const mps = Array.isArray(meta.materialPayments) ? meta.materialPayments : [];
    mps.forEach((p) => {
      if (p && p.status === "paid" && p.paidAt != null && p.amount != null) {
        const k = dayKey(new Date(p.paidAt));
        if (materialByDay[k] !== undefined) {
          materialByDay[k] += Number(p.amount) || 0;
        }
      }
    });
  });

  return dayKeys.map((date) => ({
    date,
    amount: Math.round((laborByDay[date] + materialByDay[date] + Number.EPSILON) * 100) / 100,
  }));
}

async function getAnalytics(query = {}) {
  const to = parseDate(query.to) || new Date();
  const from =
    parseDate(query.from) || new Date(to.getTime() - 29 * MS_PER_DAY);
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const dayKeys = eachDayInRange(fromDay, toDay);
  const rangeEndExclusive = new Date(toDay.getTime() + MS_PER_DAY);

  const [jobsInRange, providerUsers, activeProviderCount, allJobMetaRows] = await Promise.all([
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
      select: { meta: true },
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

  const metaList = allJobMetaRows.map((r) => r.meta).filter((m) => m != null && typeof m === "object");
  const revenueByDay = aggregateRevenueFromMeta(metaList, dayKeys);

  const totalJobs = jobsInRange.length;
  const totalRevenue = revenueByDay.reduce((s, x) => s + x.amount, 0);
  const totalProviderSignups = providerUsers.length;

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
    },
  };
}

module.exports = {
  getAnalytics,
};
