const prisma = require("../config/prisma");

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

function uniqueSorted(values) {
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function cityFromJobRow(job) {
  const loc = job.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    for (const key of ["city", "area", "suburb"]) {
      const val = loc[key];
      if (val && String(val).trim()) return String(val).trim();
    }
  }
  const l = job.location;
  if (l && String(l).trim() && String(l).trim() !== "UNKNOWN") return String(l).trim();
  return null;
}

function provinceFromJobRow(job) {
  const loc = job.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const metro = loc.metro;
    if (metro && String(metro).trim()) return String(metro).trim();
  }
  return null;
}

async function loadFilterOptions() {
  const [jobs, providers, suppliers, categories] = await Promise.all([
    prisma.job.findMany({
      select: { location: true, locationDetails: true, category: true },
      take: 5000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.provider.findMany({
      where: { deletedAt: null },
      select: { location: true, serviceAreas: true },
      take: 2000,
    }),
    prisma.supplier.findMany({
      select: { city: true },
      take: 500,
    }),
    prisma.job.findMany({
      distinct: ["category"],
      select: { category: true },
      where: { category: { not: "" } },
    }),
  ]);

  const cities = [];
  jobs.forEach((j) => {
    const c = cityFromJobRow(j);
    if (c) cities.push(c);
  });
  providers.forEach((p) => {
    if (p.location && p.location !== "UNKNOWN") cities.push(p.location);
    (p.serviceAreas || []).forEach((a) => {
      if (a && String(a).trim()) cities.push(String(a).trim());
    });
  });
  suppliers.forEach((s) => {
    if (s.city) cities.push(s.city);
  });

  const provinces = [];
  jobs.forEach((j) => {
    const p = provinceFromJobRow(j);
    if (p) provinces.push(p);
  });

  const categoryList = uniqueSorted(categories.map((c) => c.category));

  return {
    cities: uniqueSorted(cities),
    provinces: uniqueSorted(provinces),
    categories: categoryList,
  };
}

async function getFilterOptions() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) {
    return cache;
  }
  cache = await loadFilterOptions();
  cacheAt = now;
  return cache;
}

module.exports = {
  getFilterOptions,
  /** @internal — for tests */
  _clearCache: () => {
    cache = null;
    cacheAt = 0;
  },
};
