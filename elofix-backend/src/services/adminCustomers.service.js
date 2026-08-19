const prisma = require("../config/prisma");
const jobMeta = require("./jobMeta.service");
const AppError = require("../utils/AppError");
const { logAudit } = require("./auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");
const {
  netLaborPaidFromMeta,
  paidMaterialAmountFromMeta,
  refundAmountFromMeta,
  roundMoney,
} = require("../utils/jobPaidAmount.util");
const { effectiveFrontendStatus, countJobsByStatus } = require("../utils/jobStatusCounts.util");

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

/** Customer total paid = net job labour (after refunds) + paid, non-cancelled material orders. */
function computeCustomerTotalPaid(jobs, materialOrders) {
  let laborTotal = 0;
  (Array.isArray(jobs) ? jobs : []).forEach((j) => {
    const meta = jobMeta.normalizeMeta(j.meta);
    laborTotal += netLaborPaidFromMeta(meta, j);
  });

  let materialTotal = 0;
  if (Array.isArray(materialOrders) && materialOrders.length > 0) {
    materialOrders.forEach((o) => {
      if (String(o.paymentStatus || "") !== "paid") return;
      if (String(o.fulfillmentStatus || "") === "CANCELLED") return;
      materialTotal += Number(o.materialsSubtotal) || 0;
    });
  } else {
    (Array.isArray(jobs) ? jobs : []).forEach((j) => {
      if (String(j.status || "").toUpperCase() === "CANCELLED") return;
      materialTotal += paidMaterialAmountFromMeta(jobMeta.normalizeMeta(j.meta));
    });
  }

  return roundMoney(laborTotal + materialTotal);
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

function mapCustomerRow(user, jobs, categoryNameById, materialOrders) {
  const rawCounts = countJobsByStatus(jobs);
  const jobCounts = {
    total: rawCounts.total,
    completed: rawCounts.completed,
    active: rawCounts.active,
    disputed: rawCounts.disputed,
    rejected: rawCounts.rejected,
    cancelled: rawCounts.cancelled,
  };
  const serviceIds = new Set();
  jobs.forEach((j) => {
    const slug = String(j.category || "").trim();
    if (slug) serviceIds.add(slug);
  });
  const servicesRequested = [...serviceIds].map((id) => categoryNameById.get(id) || id);
  const totalPaid = computeCustomerTotalPaid(jobs, materialOrders);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    profileImage: user.profileImage || null,
    authProvider: user.authProvider || "LOCAL",
    blocked: Boolean(user.blocked),
    marketplaceRestricted: Boolean(user.marketplaceRestricted),
    marketplaceRestrictedReason: user.marketplaceRestrictedReason || null,
    deletedAt: user.deletedAt || null,
    city: latestCityFromJobs(jobs),
    registeredAt: user.createdAt,
    jobCounts,
    servicesRequested,
    totalPaid,
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

  const [users, allJobs, categoryNameById, allMaterialOrders] = await Promise.all([
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
    prisma.materialOrder.findMany({
      select: {
        userId: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        materialsSubtotal: true,
      },
    }),
  ]);

  const jobsByCustomer = new Map();
  allJobs.forEach((job) => {
    const list = jobsByCustomer.get(job.customerId) || [];
    list.push(job);
    jobsByCustomer.set(job.customerId, list);
  });

  const ordersByCustomer = new Map();
  allMaterialOrders.forEach((order) => {
    const list = ordersByCustomer.get(order.userId) || [];
    list.push(order);
    ordersByCustomer.set(order.userId, list);
  });

  let totalRevenue = 0;
  users.forEach((user) => {
    totalRevenue += computeCustomerTotalPaid(
      jobsByCustomer.get(user.id) || [],
      ordersByCustomer.get(user.id) || [],
    );
  });
  totalRevenue = roundMoney(totalRevenue);

  let customers = users.map((user) =>
    mapCustomerRow(
      user,
      jobsByCustomer.get(user.id) || [],
      categoryNameById,
      ordersByCustomer.get(user.id) || [],
    )
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
      marketplaceRestricted: true,
      marketplaceRestrictedReason: true,
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
  const profile = mapCustomerRow(user, jobs, categoryNameById, materialOrders);
  const jobRows = jobs.map((job) => {
    const st = effectiveFrontendStatus(job);
    const categoryId = String(job.category || "").trim();
    const meta = jobMeta.normalizeMeta(job.meta);
    const refundAmount = refundAmountFromMeta(meta);
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
      totalPaid: netLaborPaidFromMeta(meta, job),
      refundAmount: refundAmount > 0 ? roundMoney(refundAmount) : undefined,
      providerId: job.providerId,
      provider: job.providerId ? providerById.get(job.providerId) || null : null,
    };
  });

  const cities = [...new Set(jobs.map(cityFromJobRow).filter(Boolean))];

  let paymentObligations = [];
  try {
    const obligationService = require("./customerPaymentObligation.service");
    const rows = await prisma.customerPaymentObligation.findMany({
      where: { customerId: userId, status: { in: obligationService.OPEN_STATUSES } },
      orderBy: { dueAt: "asc" },
    });
    paymentObligations = rows.map((row) => ({
      ...obligationService.toObligationDto(row),
      displayStatus: obligationService.deriveDisplayStatus(row),
    }));
  } catch (_e) {
    paymentObligations = [];
  }

  return {
    ...profile,
    cities,
    topMaterialStore,
    materialStores,
    jobs: jobRows,
    paymentObligations,
  };
}

async function loadCustomerUser(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER" },
    select: { id: true, blocked: true, blockedReason: true, deletedAt: true },
  });
  if (!user) {
    throw new AppError("Customer not found", 404);
  }
  return user;
}

async function blockCustomerByUserId(userId, auditOpts = {}) {
  const user = await loadCustomerUser(userId);
  const reason = String(auditOpts.reason || "").trim();
  if (!reason) {
    throw new AppError("Block reason is required", 400);
  }
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: true, blockedReason: reason, blockedAt: now },
  });
  await logAudit(AUDIT_ACTIONS.VERIFICATION_CUSTOMER_BLOCKED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.USER,
    entityId: userId,
    oldValue: { blocked: user.blocked, blockedReason: user.blockedReason || null },
    newValue: { blocked: true, blockedReason: reason },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });
  const notificationEvents = require("./notificationEvents.service");
  await notificationEvents.notifyAccountBlocked(userId, reason);
  return getCustomerById(userId);
}

async function unblockCustomerByUserId(userId, auditOpts = {}) {
  const user = await loadCustomerUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: false, blockedReason: null, blockedAt: null },
  });
  await logAudit(AUDIT_ACTIONS.VERIFICATION_CUSTOMER_UNBLOCKED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.USER,
    entityId: userId,
    oldValue: { blocked: user.blocked },
    newValue: { blocked: false },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
  });
  const notificationEvents = require("./notificationEvents.service");
  await notificationEvents.notifyAccountUnblocked(userId);
  return getCustomerById(userId);
}

async function softDeleteCustomerByUserId(userId, auditOpts = {}) {
  const user = await loadCustomerUser(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), blocked: true },
  });
  await logAudit(AUDIT_ACTIONS.VERIFICATION_CUSTOMER_DELETED, {
    userId: auditOpts.userId,
    actorType: ACTOR_TYPES.ADMIN,
    entityType: ENTITY_TYPES.USER,
    entityId: userId,
    oldValue: { deletedAt: user.deletedAt, blocked: user.blocked },
    newValue: { deletedAt: new Date().toISOString(), blocked: true },
    ipAddress: auditOpts.ipAddress,
    deviceFingerprint: auditOpts.deviceFingerprint,
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
