const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

function moneyNum(d) {
  if (d == null) return 0;
  const n = Number(d);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Overview KPIs for supplier dashboard (all branches).
 */
async function getSupplierOverview(supplierOrgId) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) throw new AppError("Invalid supplier", 400);

  const totalBranches = await prisma.branch.count({ where: { supplierId: sid } });

  const orders = await prisma.materialOrder.findMany({
    where: { supplierId: sid },
    select: {
      supplierEarning: true,
      platformCommission: true,
      fulfillmentStatus: true,
    },
  });

  let sumNetEarnings = 0;
  let sumPlatformCommission = 0;
  let totalPendingOrders = 0;
  for (const o of orders) {
    const st = String(o.fulfillmentStatus || "").toUpperCase();
    if (st === "PENDING") totalPendingOrders += 1;
    if (st === "CANCELLED") continue;
    sumNetEarnings += moneyNum(o.supplierEarning);
    sumPlatformCommission += moneyNum(o.platformCommission);
  }

  const sumNet = Math.round(sumNetEarnings * 100) / 100;
  const sumCommission = Math.round(sumPlatformCommission * 100) / 100;

  return {
    totalBranches,
    sumNetEarningsAllBranches: sumNet,
    sumPlatformCommissionAllBranches: sumCommission,
    sumGrossRevenueAllBranches: Math.round((sumNet + sumCommission) * 100) / 100,
    totalOrders: orders.length,
    totalPendingOrders,
  };
}

/**
 * Portal overview for branch staff — metrics scoped to one branch only.
 */
async function getBranchStaffOverview(supplierOrgId, branchId) {
  const sid = String(supplierOrgId || "").trim();
  const bid = String(branchId || "").trim();
  if (!sid || !bid) throw new AppError("Invalid supplier", 400);

  const exists = await prisma.branch.findFirst({
    where: { id: bid, supplierId: sid },
    select: { id: true },
  });
  if (!exists) throw new AppError("Branch not found", 404);

  const orders = await prisma.materialOrder.findMany({
    where: { supplierId: sid, branchId: bid },
    select: {
      supplierEarning: true,
      platformCommission: true,
      fulfillmentStatus: true,
    },
  });

  let sumNetEarnings = 0;
  let sumPlatformCommission = 0;
  let totalPendingOrders = 0;
  for (const o of orders) {
    const st = String(o.fulfillmentStatus || "").toUpperCase();
    if (st === "PENDING") totalPendingOrders += 1;
    if (st === "CANCELLED") continue;
    sumNetEarnings += moneyNum(o.supplierEarning);
    sumPlatformCommission += moneyNum(o.platformCommission);
  }

  const sumNet = Math.round(sumNetEarnings * 100) / 100;
  const sumCommission = Math.round(sumPlatformCommission * 100) / 100;

  return {
    totalBranches: 1,
    sumNetEarningsAllBranches: sumNet,
    sumPlatformCommissionAllBranches: sumCommission,
    sumGrossRevenueAllBranches: Math.round((sumNet + sumCommission) * 100) / 100,
    totalOrders: orders.length,
    totalPendingOrders,
  };
}

function ordersDateWhere(query = {}) {
  const fromRaw = query.from != null ? String(query.from).trim() : "";
  const toRaw = query.to != null ? String(query.to).trim() : "";
  if (!fromRaw && !toRaw) return {};
  const createdAt = {};
  if (fromRaw) {
    const d = new Date(fromRaw);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      createdAt.lte = d;
    }
  }
  return Object.keys(createdAt).length ? { createdAt } : {};
}

/**
 * Per-branch stats for supplier UI cards + filters.
 */
async function listBranchesWithStats(supplierOrgId, query = {}) {
  const sid = String(supplierOrgId || "").trim();
  if (!sid) throw new AppError("Invalid supplier", 400);

  const cityFilter = String(query.city || "").trim().toLowerCase();
  const q = String(query.q || "").trim().toLowerCase();

  const branches = await prisma.branch.findMany({
    where: { supplierId: sid },
    orderBy: { name: "asc" },
    include: {
      branchUsers: { select: { email: true, role: true }, take: 5 },
    },
  });

  const dateFilter = ordersDateWhere(query);

  const orders = await prisma.materialOrder.findMany({
    where: { supplierId: sid, ...dateFilter },
    select: {
      branchId: true,
      fulfillmentStatus: true,
      supplierEarning: true,
      platformCommission: true,
      createdAt: true,
    },
  });

  const agg = new Map();
  for (const o of orders) {
    const bid = String(o.branchId || "");
    if (!agg.has(bid)) {
      agg.set(bid, { total: 0, pending: 0, net: 0, commission: 0 });
    }
    const a = agg.get(bid);
    a.total += 1;
    const st = String(o.fulfillmentStatus || "").toUpperCase();
    if (st === "PENDING") a.pending += 1;
    if (st !== "CANCELLED") {
      a.net += moneyNum(o.supplierEarning);
      a.commission += moneyNum(o.platformCommission);
    }
  }

  const out = [];
  for (const b of branches) {
    const city = (b.city || "").trim().toLowerCase();
    const area = (b.area || "").trim().toLowerCase();
    const name = (b.name || "").trim().toLowerCase();
    const addr = (b.address || "").trim().toLowerCase();
    if (cityFilter && city !== cityFilter) continue;
    if (q) {
      const hay = `${name} ${addr} ${city} ${area}`;
      let managerMatch = false;
      for (const u of b.branchUsers || []) {
        if (String(u.email || "").toLowerCase().includes(q)) {
          managerMatch = true;
          break;
        }
      }
      if (!hay.includes(q) && !managerMatch) continue;
    }
    const s = agg.get(b.id) || { total: 0, pending: 0, net: 0, commission: 0 };
    const netEarnings = Math.round(s.net * 100) / 100;
    const platformCommission = Math.round(s.commission * 100) / 100;
    out.push({
      branchId: b.id,
      name: b.name,
      city: b.city || undefined,
      area: b.area || undefined,
      address: b.address || undefined,
      isActive: b.isActive,
      totalOrders: s.total,
      pendingOrders: s.pending,
      netEarnings,
      platformCommission,
      grossRevenue: Math.round((netEarnings + platformCommission) * 100) / 100,
      managerEmails: (b.branchUsers || []).map((u) => u.email).filter(Boolean),
    });
  }

  return out;
}

/**
 * Read-only branch inventory + units sold (non-cancelled orders) for supplier oversight.
 */
async function getBranchInventoryInsights(supplierOrgId, branchId) {
  const sid = String(supplierOrgId || "").trim();
  const bid = String(branchId || "").trim();
  if (!sid || !bid) throw new AppError("branchId required", 400);

  const br = await prisma.branch.findFirst({
    where: { id: bid, supplierId: sid },
  });
  if (!br) throw new AppError("Branch not found", 404);

  const products = Array.isArray(br.products) ? br.products : [];
  const productRows = products
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String((p).id || ""),
      name: String((p).name || ""),
      category: String((p).category || "general"),
      quantity: Number((p).quantity ?? 0) || 0,
      price: Number((p).price ?? 0) || 0,
    }));

  const orders = await prisma.materialOrder.findMany({
    where: { supplierId: sid, branchId: bid },
    select: { fulfillmentStatus: true, payload: true },
  });

  const unitsSoldByProduct = new Map();
  for (const o of orders) {
    const st = String(o.fulfillmentStatus || "").toUpperCase();
    if (st === "CANCELLED") continue;
    const payload = o.payload && typeof o.payload === "object" ? o.payload : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const line of items) {
      if (!line || typeof line !== "object") continue;
      const pid = String(line.productId || line.id || "");
      if (!pid) continue;
      const qty = Number(line.qty ?? line.quantity ?? 0) || 0;
      unitsSoldByProduct.set(pid, (unitsSoldByProduct.get(pid) || 0) + qty);
    }
  }

  const enriched = productRows.map((p) => ({
    ...p,
    unitsSold: unitsSoldByProduct.get(p.id) || 0,
    unitsAddedApprox: null,
  }));

  return {
    branchId: br.id,
    products: enriched,
    categories: [...new Set(enriched.map((x) => x.category))].sort(),
  };
}

module.exports = {
  getSupplierOverview,
  getBranchStaffOverview,
  listBranchesWithStats,
  getBranchInventoryInsights,
};
