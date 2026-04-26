const prisma = require("../config/prisma");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object} [query] - { from, to } ISO or date
 */
async function getCommissionSummary(query = {}) {
  const to = parseDate(query.to) || new Date();
  const from = parseDate(query.from) || new Date(to.getTime() - 29 * MS_PER_DAY);
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const rangeEnd = new Date(toDay.getTime() + MS_PER_DAY);

  const [agg, byDay] = await Promise.all([
    prisma.commissionLedger.aggregate({
      where: { createdAt: { gte: from, lt: rangeEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.commissionLedger.findMany({
      where: { createdAt: { gte: from, lt: rangeEnd } },
      select: { amount: true, createdAt: true, currency: true, jobId: true, totalPrice: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const dayMap = new Map();
  for (const row of byDay) {
    const k = row.createdAt.toISOString().slice(0, 10);
    const n = Number(row.amount) || 0;
    dayMap.set(k, (dayMap.get(k) || 0) + n);
  }

  const byDayList = Array.from(dayMap.entries()).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

  return {
    from: from.toISOString().slice(0, 10),
    to: toDay.toISOString().slice(0, 10),
    totalCommission: agg._sum.amount != null ? Number(agg._sum.amount) : 0,
    transactionCount: agg._count._all,
    byDay: byDayList,
  };
}

module.exports = { getCommissionSummary };
