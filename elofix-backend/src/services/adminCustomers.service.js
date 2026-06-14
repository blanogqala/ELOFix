const prisma = require("../config/prisma");
const jobMeta = require("./jobMeta.service");
const AppError = require("../utils/AppError");
const { paidAmountFromJob, roundMoney } = require("../utils/jobPaidAmount.util");

const ACTIVE_STATUSES = new Set([
  "ASSIGNED",
  "INSPECTED",
  "SERVICE_PRICE_SUBMITTED",
  "SERVICE_PAID",
  "MATERIALS_SUBMITTED",
  "MATERIALS_PAID",
  "IN_PROGRESS",
  "AWAITING_CONFIRMATION",
]);

function cityFromJobRow(job) {
  const loc = job.locationDetails;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const city = loc.city || loc.area || loc.suburb;
    if (city && String(city).trim()) return String(city).trim();
  }
  const l = job.location;
  if (l && String(l).trim() && String(l).trim() !== "UNKNOWN") return String(l).trim();
  return null;
}

function effectiveFrontendStatus(jobRow) {
  const meta = jobMeta.normalizeMeta(jobRow.meta);
  return jobMeta.toFrontendStatus(jobRow.status, meta);
}

function countJobsByStatus(jobs) {
  const counts = {
    total: jobs.length,
    completed: 0,
    active: 0,
    open: 0,
    rejected: 0,
    cancelled: 0,
  };
  jobs.forEach((job) => {
    const st = effectiveFrontendStatus(job);
    if (st === "COMPLETED") counts.completed += 1;
    else if (st === "REJECTED") counts.rejected += 1;
    else if (st === "CANCELLED") counts.cancelled += 1;
    else if (ACTIVE_STATUSES.has(st)) counts.active += 1;
    else if (st === "PENDING") counts.open += 1;
  });
  return counts;
}

function latestCityFromJobs(jobs) {
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  for (const job of sorted) {
    const c = cityFromJobRow(job);
    if (c) return c;
  }
  return null;
}

function supplierDisplayName(supplier) {
  if (!supplier) return "Unknown supplier";
  return (
    supplier.businessName ||
    supplier.brandName ||
    supplier.name ||
    "Unknown supplier"
  );
}

function buildMaterialStoreStats(orders) {
  const byBranch = new Map();
  (Array.isArray(orders) ? orders : []).forEach((o) => {
    if (String(o.paymentStatus || "") !== "paid") return;
    if (String(o.fulfillmentStatus || "") === "CANCELLED") return;
    const key = o.branchId;
    const spent = Number(o.materialsSubtotal) || 0;
    const existing = byBranch.get(key) || {
      branchId: o.branchId,
      branchName: o.branch?.name || "Branch",
      branchCity: o.branch?.city || null,
      supplierId: o.supplierId,
      supplierName: supplierDisplayName(o.supplier),
      orderCount: 0,
      totalSpent: 0,
    };
    existing.orderCount += 1;
    existing.totalSpent = roundMoney(existing.totalSpent + spent);
    byBranch.set(key, existing);
  });
  const materialStores = [...byBranch.values()].sort(
    (a, b) => b.orderCount - a.orderCount || b.totalSpent - a.totalSpent
  );
  return {
    materialStores,
    topMaterialStore: materialStores[0] || null,
  };
}

async function loadProviderSummaries(providerUserIds) {
  const ids = [...new Set((providerUserIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, role: "PROVIDER" },
    select: {
      id: true,
      name: true,
      email: true,
      providerProfile: { select: { businessName: true } },
    },
  });
  return new Map(
    rows.map((u) => [
      u.id,
      {
        id: u.id,
        name: u.name,
        email: u.email,
        businessName: u.providerProfile?.businessName || null,
      },
    ])
  );
}

function mapCustomerRow(user, jobs, categoryNameById) {
  const jobCounts = countJobsByStatus(jobs);
  const serviceIds = new Set();
  jobs.forEach((j) => {
    const slug = String(j.category || "").trim();
    if (slug) serviceIds.add(slug);
  });
  const servicesRequested = [...serviceIds].map((id) => categoryNameById.get(id) || id);
  let totalPaid = 0;
  jobs.forEach((j) => {
    totalPaid += paidAmountFromJob(j);
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    profileImage: user.profileImage || null,
    authProvider: user.authProvider || "LOCAL",
    blocked: Boolean(user.blocked),
    deletedAt: user.deletedAt || null,
    city: latestCityFromJobs(jobs),
    registeredAt: user.createdAt,
    jobCounts,
    servicesRequested,
    totalPaid: roundMoney(totalPaid),
  };
}

function matchesStatusFilter(jobCounts, statusFilter) {
  if (!statusFilter || statusFilter === "all") return true;
  if (statusFilter === "has_active") return jobCounts.active > 0;
  if (statusFilter === "has_completed") return jobCounts.completed > 0;
  if (statusFilter === "no_jobs") return jobCounts.total === 0;
  return true;
}

async function loadCategoryNameMap() {
  const rows = await prisma.category.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((c) => [c.id, c.name]));
}

async function listCustomers(query = {}) {
  const search = String(query.search || "").trim().toLowerCase();
  const cityFilter = String(query.city || "").trim();
  const statusFilter = String(query.status || "all").trim();

  const [users, allJobs, categoryNameById] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CUSTOMER", deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        profileImage: true,
        authProvider: true,
        blocked: true,
        deletedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.findMany({
      select: {
        id: true,
        customerId: true,
        category: true,
        status: true,
        meta: true,
        location: true,
        locationDetails: true,
        createdAt: true,
        title: true,
        price: true,
        laborPaid: true,
        totalPrice: true,
      },
    }),
    loadCategoryNameMap(),
  ]);

  const jobsByCustomer = new Map();
  allJobs.forEach((job) => {
    const list = jobsByCustomer.get(job.customerId) || [];
    list.push(job);
    jobsByCustomer.set(job.customerId, list);
  });

  let totalRevenue = 0;
  allJobs.forEach((row) => {
    totalRevenue += paidAmountFromJob(row);
  });
  totalRevenue = roundMoney(totalRevenue);

  let customers = users.map((user) =>
    mapCustomerRow(user, jobsByCustomer.get(user.id) || [], categoryNameById)
  );

  if (search) {
    customers = customers.filter((c) => {
      const hay = [c.name, c.email, c.phone || ""].join(" ").toLowerCase();
      return hay.includes(search);
    });
  }
  if (cityFilter && cityFilter !== "all") {
    customers = customers.filter((c) => c.city === cityFilter);
  }
  if (statusFilter && statusFilter !== "all") {
    customers = customers.filter((c) => matchesStatusFilter(c.jobCounts, statusFilter));
  }

  return {
    summary: {
      totalRegistered: users.length,
      totalRevenue,
    },
    customers,
  };
}

async function getCustomerById(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      profileImage: true,
      authProvider: true,
      blocked: true,
      deletedAt: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const [jobs, categoryNameById, materialOrders] = await Promise.all([
    prisma.job.findMany({
      where: { customerId: userId },
      select: {
        id: true,
        customerId: true,
        category: true,
        status: true,
        meta: true,
        location: true,
        locationDetails: true,
        createdAt: true,
        title: true,
        price: true,
        laborPaid: true,
        totalPrice: true,
        providerId: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    loadCategoryNameMap(),
    prisma.materialOrder.findMany({
      where: { userId },
      select: {
        branchId: true,
        supplierId: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        materialsSubtotal: true,
        branch: { select: { id: true, name: true, city: true } },
        supplier: { select: { id: true, name: true, businessName: true, brandName: true } },
      },
    }),
  ]);
  const providerById = await loadProviderSummaries(jobs.map((j) => j.providerId));

  const { materialStores, topMaterialStore } = buildMaterialStoreStats(materialOrders);
  const profile = mapCustomerRow(user, jobs, categoryNameById);
  const jobRows = jobs.map((job) => {
    const st = effectiveFrontendStatus(job);
    const categoryId = String(job.category || "").trim();
    return {
      id: job.id,
      title: job.title,
      categoryId,
      categoryName: categoryNameById.get(categoryId) || categoryId || "General",
      status: st,
      createdAt: job.createdAt,
      siteAddress: (() => {
        const loc = job.locationDetails;
        if (loc && typeof loc === "object" && !Array.isArray(loc)) {
          const parts = [loc.address, loc.suburb, loc.area, loc.city].filter(Boolean);
          if (parts.length) return parts.join(", ");
        }
        const l = job.location;
        if (l && String(l).trim() !== "UNKNOWN") return String(l).trim();
        return "";
      })(),
      totalPaid: roundMoney(paidAmountFromJob(job)),
      providerId: job.providerId,
      provider: job.providerId ? providerById.get(job.providerId) || null : null,
    };
  });

  const cities = [...new Set(jobs.map(cityFromJobRow).filter(Boolean))];

  return {
    ...profile,
    cities,
    topMaterialStore,
    materialStores,
    jobs: jobRows,
  };
}

async function loadCustomerUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER" },
    select: { id: true, blocked: true, deletedAt: true },
  });
  if (!user) {
    throw new AppError("Customer not found", 404);
  }
  return user;
}

async function blockCustomerByUserId(userId) {
  await loadCustomerUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: true },
  });
  return getCustomerById(userId);
}

async function unblockCustomerByUserId(userId) {
  await loadCustomerUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: false },
  });
  return getCustomerById(userId);
}

async function softDeleteCustomerByUserId(userId) {
  await loadCustomerUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), blocked: true },
  });
  return getCustomerById(userId);
}

module.exports = {
  listCustomers,
  getCustomerById,
  blockCustomerByUserId,
  unblockCustomerByUserId,
  softDeleteCustomerByUserId,
};
