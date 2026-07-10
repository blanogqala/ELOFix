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

function normalizeRoleFilter(value) {
  const r = String(value || "").trim().toUpperCase();
  if (!r || r === "ALL") return null;
  if (["CUSTOMER", "PROVIDER", "SUPPLIER"].includes(r)) return r;
  return null;
}

function buildJobWhereClause(query = {}) {
  const and = [];
  const city = String(query.city || "").trim();
  const province = String(query.province || "").trim();
  const category = String(query.category || "").trim();
  const search = String(query.search || "").trim();

  if (category) {
    and.push({ category: { equals: category, mode: "insensitive" } });
  }

  if (city) {
    and.push({
      OR: [
        { location: { equals: city, mode: "insensitive" } },
        { location: { contains: city, mode: "insensitive" } },
        {
          locationDetails: {
            path: ["city"],
            string_contains: city,
            mode: "insensitive",
          },
        },
        {
          locationDetails: {
            path: ["area"],
            string_contains: city,
            mode: "insensitive",
          },
        },
        {
          locationDetails: {
            path: ["suburb"],
            string_contains: city,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (province) {
    and.push({
      OR: [
        {
          locationDetails: {
            path: ["metro"],
            string_contains: province,
            mode: "insensitive",
          },
        },
        {
          locationDetails: {
            path: ["metro"],
            equals: province,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        {
          customer: {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          provider: {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (and.length === 0) return {};
  return { AND: and };
}

function buildDaySeries(dayKeys, rows, dateField = "createdAt") {
  const map = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  rows.forEach((row) => {
    const k = dayKey(row[dateField]);
    if (map[k] !== undefined) map[k] += 1;
  });
  return dayKeys.map((date) => ({ date, count: map[date] || 0 }));
}

function buildDisputesByDay(dayKeys, disputes) {
  const openedMap = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  const resolvedMap = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  disputes.forEach((d) => {
    const ok = dayKey(d.openedAt);
    if (openedMap[ok] !== undefined) openedMap[ok] += 1;
    if (d.resolvedAt) {
      const rk = dayKey(d.resolvedAt);
      if (resolvedMap[rk] !== undefined) resolvedMap[rk] += 1;
    }
  });
  return dayKeys.map((date) => ({
    date,
    opened: openedMap[date] || 0,
    resolved: resolvedMap[date] || 0,
  }));
}

function buildCommissionByDay(dayKeys, ledgerRows, materialOrders, roundMoney) {
  const map = Object.fromEntries(dayKeys.map((k) => [k, 0]));
  ledgerRows.forEach((row) => {
    const k = dayKey(row.createdAt);
    if (map[k] !== undefined) map[k] += Number(row.amount) || 0;
  });
  materialOrders.forEach((row) => {
    const k = dayKey(row.createdAt);
    if (map[k] !== undefined) map[k] += Number(row.platformCommission) || 0;
  });
  return dayKeys.map((date) => ({
    date,
    amount: roundMoney(map[date] || 0),
  }));
}

function pctDelta(current, previous, roundMoney = roundMoneyForDelta) {
  if (!Number.isFinite(previous) || previous === 0) {
    if (!Number.isFinite(current) || current === 0) return 0;
    return 100;
  }
  return roundMoney(((current - previous) / Math.abs(previous)) * 100);
}

function roundMoneyForDelta(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = {
  MS_PER_DAY,
  parseDate,
  dayKey,
  eachDayInRange,
  normalizeRoleFilter,
  buildJobWhereClause,
  buildDaySeries,
  buildDisputesByDay,
  buildCommissionByDay,
  pctDelta,
};
