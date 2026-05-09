const providerService = require("../services/provider.service");
const adminAnalyticsService = require("../services/adminAnalytics.service");
const categoryService = require("../services/category.service");
const withdrawalAdminService = require("../services/withdrawalAdmin.service");
const { reconcileProvider } = require("../services/reconciliation.service");
const { getFinancialSummary } = require("../services/financialSummary.service");
const { getCommissionSummary } = require("../services/commission.service");
const AppError = require("../utils/AppError");
const supplierService = require("../services/supplier.service");
const materialOrderService = require("../services/materialOrder.service");

async function listProviders(req, res) {
  const providers = await providerService.listProviders({
    category: req.query.category,
    forAdmin: true,
  });
  res.json({ success: true, providers });
}

async function approveProvider(req, res) {
  const provider = await providerService.approveProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function rejectProvider(req, res) {
  const reason = req.body?.reason || req.body?.rejectionReason;
  const provider = await providerService.rejectProviderByUserId(req.params.userId, reason);
  res.json({ success: true, provider });
}

async function blockProvider(req, res) {
  const provider = await providerService.blockProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function unblockProvider(req, res) {
  const provider = await providerService.unblockProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function deleteProvider(req, res) {
  const provider = await providerService.softDeleteProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function approveProviderDocument(req, res) {
  const docType = String(req.params.docType || "").trim();
  const provider = await providerService.approveProviderDocumentByUserId(req.params.userId, docType);
  res.json({ success: true, provider });
}

async function getAnalytics(req, res) {
  const data = await adminAnalyticsService.getAnalytics(req.query || {});
  res.json({ success: true, ...data });
}

async function rejectProviderDocument(req, res) {
  const docType = String(req.params.docType || "").trim();
  const feedback = req.body?.feedback ?? req.body?.reason ?? "";
  const provider = await providerService.rejectProviderDocumentByUserId(
    req.params.userId,
    docType,
    feedback
  );
  res.json({ success: true, provider });
}

async function listCategorySuggestions(req, res) {
  const suggestions = await categoryService.listCategorySuggestionsForAdmin({
    status: req.query.status,
  });
  res.json({ success: true, suggestions });
}

async function approveCategorySuggestion(req, res) {
  const result = await categoryService.approveCategorySuggestion(req.params.id, req.body || {});
  res.json({ success: true, ...result });
}

async function rejectCategorySuggestion(req, res) {
  const result = await categoryService.rejectCategorySuggestion(req.params.id);
  res.json({ success: true, ...result });
}

async function listWithdrawals(req, res) {
  const data = await withdrawalAdminService.listWithdrawals();
  res.json({ success: true, ...data });
}

async function approveWithdrawal(req, res) {
  const data = await withdrawalAdminService.approveWithdrawal(req.user.userId, req.params.id);
  res.json({ success: true, ...data });
}

async function markWithdrawalPaid(req, res) {
  const data = await withdrawalAdminService.markWithdrawalPaid(req.user.userId, req.params.id);
  res.json({ success: true, ...data });
}

async function markWithdrawalFailed(req, res) {
  const data = await withdrawalAdminService.markWithdrawalFailed(
    req.user.userId,
    req.params.id,
    req.body?.reason
  );
  res.json({ success: true, ...data });
}

async function getReconcileProvider(req, res) {
  const providerId = String(req.params.providerId || "").trim();
  if (!providerId) {
    throw new AppError("providerId is required", 400);
  }
  const result = await reconcileProvider(providerId, req.user.userId);
  res.json({ success: true, ...result });
}

async function getFinancialSummaryEndpoint(req, res) {
  const summary = await getFinancialSummary();
  res.json({ success: true, summary });
}

async function getCommissions(req, res) {
  const data = await getCommissionSummary(req.query || {});
  res.json({ success: true, ...data });
}

async function listSuppliers(req, res) {
  const suppliers = await supplierService.listSuppliersForAdminDashboard();
  let globalSupplierOrderAnalytics;
  try {
    globalSupplierOrderAnalytics = await materialOrderService.aggregateCompletedPaidMaterialOrders({});
  } catch (err) {
    console.error("[admin.listSuppliers] aggregate material orders failed", err);
    globalSupplierOrderAnalytics = {
      orderCount: 0,
      totalRevenue: 0,
      totalCommission: 0,
      averageOrderValue: 0,
      commissionRate: 0.07,
    };
  }
  res.json({
    success: true,
    suppliers,
    globalSupplierOrderAnalytics: {
      totalSuppliers: suppliers.length,
      ...globalSupplierOrderAnalytics,
    },
  });
}

/** Admin provisions supplier login + org + default branch (same as POST /suppliers). */
async function createSupplier(req, res) {
  const supplier = await supplierService.provisionSupplierByAdmin(req.body || {});
  res.status(201).json({ success: true, supplier });
}

async function getAdminSupplierDetail(req, res) {
  const supplierId = String(req.params.supplierId || "").trim();
  if (!supplierId) {
    throw new AppError("supplierId is required", 400);
  }
  const supplier = await supplierService.getSupplierDetailsForAdmin(supplierId);
  if (!supplier) {
    throw new AppError("Supplier not found", 404);
  }
  let analytics;
  try {
    analytics = await materialOrderService.aggregateCompletedPaidMaterialOrders({ supplierId });
  } catch (err) {
    console.error("[admin.getAdminSupplierDetail] aggregate failed", err);
    analytics = {
      orderCount: 0,
      totalRevenue: 0,
      totalCommission: 0,
      averageOrderValue: 0,
      commissionRate: 0.07,
    };
  }
  res.json({ success: true, supplier, analytics });
}

async function listSupplierOrders(req, res) {
  const supplierId = String(req.params.supplierId || "").trim();
  if (!supplierId) {
    throw new AppError("supplierId is required", 400);
  }
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const orders = await materialOrderService.listRecentMaterialOrdersBySupplierForAdmin(supplierId, { limit });
  res.json({ success: true, orders });
}

/** Same rows/summary shape as supplier portal `GET /supplier/orders/export`, scoped by supplier org (admin). */
async function getAdminSupplierOrdersExport(req, res) {
  const supplierId = String(req.params.supplierId || "").trim();
  if (!supplierId) {
    throw new AppError("supplierId is required", 400);
  }
  const supplier = await supplierService.getSupplierDetailsForAdmin(supplierId);
  if (!supplier) {
    throw new AppError("Supplier not found", 404);
  }
  const out = await materialOrderService.buildSupplierOrdersExport(supplierId, {
    from: req.query.from || undefined,
    to: req.query.to || undefined,
    branchId: req.query.branchId || undefined,
  });
  res.json({ success: true, ...out });
}

async function listSupplierMaterialOrders(req, res) {
  const supplierId = String(req.params.supplierId || "").trim();
  if (!supplierId) {
    throw new AppError("supplierId is required", 400);
  }
  const orders = await materialOrderService.listMaterialOrdersBySupplierIdsForAdmin([supplierId]);
  res.json({ success: true, orders });
}

async function listAllPlatformMaterialOrders(req, res) {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const orders = await materialOrderService.listAllMaterialOrdersForAdmin({ limit });
  const totalMaterialsRevenue = orders.reduce((s, o) => s + Number(o.materialsSubtotal || 0), 0);
  const platformCommissionTotal = orders.reduce((s, o) => s + Number(o.platformCommission || 0), 0);
  res.json({
    success: true,
    orders,
    summary: {
      orderCount: orders.length,
      totalMaterialsRevenue,
      platformCommissionTotal,
    },
  });
}

module.exports = {
  listProviders,
  getAnalytics,
  approveProvider,
  rejectProvider,
  approveProviderDocument,
  rejectProviderDocument,
  blockProvider,
  unblockProvider,
  deleteProvider,
  listCategorySuggestions,
  approveCategorySuggestion,
  rejectCategorySuggestion,
  listWithdrawals,
  approveWithdrawal,
  markWithdrawalPaid,
  markWithdrawalFailed,
  getReconcileProvider,
  getFinancialSummaryEndpoint,
  getCommissions,
  listSuppliers,
  createSupplier,
  getAdminSupplierDetail,
  listSupplierOrders,
  getAdminSupplierOrdersExport,
  listSupplierMaterialOrders,
  listAllPlatformMaterialOrders,
};
