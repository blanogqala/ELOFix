const providerService = require("../services/provider.service");
const adminAnalyticsService = require("../services/adminAnalytics.service");
const adminAnalyticsFilterOptionsService = require("../services/adminAnalyticsFilterOptions.service");
const platformHealthService = require("../services/platformHealth.service");
const categoryService = require("../services/category.service");
const withdrawalAdminService = require("../services/withdrawalAdmin.service");
const disputeAdminService = require("../services/disputeAdmin.service");
const { reconcileProvider } = require("../services/reconciliation.service");
const { getFinancialSummary } = require("../services/financialSummary.service");
const { getCommissionSummary } = require("../services/commission.service");
const AppError = require("../utils/AppError");
const supplierService = require("../services/supplier.service");
const materialOrderService = require("../services/materialOrder.service");
const branchAccountService = require("../services/branchAccount.service");
const adminCustomersService = require("../services/adminCustomers.service");
const adminProviderService = require("../services/adminProvider.service");
const prisma = require("../config/prisma");
const refundJobService = require("../services/refundJob.service");
const { getAdminAuditContext } = require("../utils/auditContext.util");
const { logAudit } = require("../services/auditLog.service");
const { AUDIT_ACTIONS, ENTITY_TYPES, ACTOR_TYPES } = require("../constants/auditActions");

async function processAdminJobRefund(req, res) {
  const jobId = String(req.params.jobId || "").trim();
  if (!jobId) throw new AppError("jobId is required", 400);
  const laborRefundNet = Number(req.body?.laborRefundNet ?? req.body?.laborRefund ?? 0);
  const materialsRefundNet = Number(req.body?.materialsRefundNet ?? req.body?.materialsRefund ?? 0);
  const job = await refundJobService.processAdminJobRefund({
    jobId,
    laborRefundNet,
    materialsRefundNet,
    adminUserId: req.user.userId,
    idempotencyKey: req.financialIdempotencyKey,
    requestHash: req.financialRequestHash,
    route: req.financialIdempotencyRoute,
  });
  res.json({ success: true, job });
}

async function listProviders(req, res) {
  const providers = await providerService.listProviders({
    category: req.query.category,
    forAdmin: true,
  });
  res.json({ success: true, providers });
}

async function listProviderNetRevenues(req, res) {
  const revenues = await providerService.listProviderNetRevenues();
  res.json({ success: true, revenues });
}

async function getProviderAnalytics(req, res) {
  const analytics = await adminProviderService.getProviderAnalyticsForAdmin(req.params.userId);
  res.json({ success: true, analytics });
}

async function listCustomers(req, res) {
  const data = await adminCustomersService.listCustomers(req.query || {});
  res.json({ success: true, ...data });
}

async function getCustomerById(req, res) {
  const customer = await adminCustomersService.getCustomerById(req.params.userId);
  if (!customer) {
    throw new AppError("Customer not found", 404);
  }
  res.json({ success: true, customer });
}

async function blockCustomer(req, res) {
  const customer = await adminCustomersService.blockCustomerByUserId(
    req.params.userId,
    { ...getAdminAuditContext(req), reason: req.body?.reason }
  );
  res.json({ success: true, customer });
}

async function unblockCustomer(req, res) {
  const customer = await adminCustomersService.unblockCustomerByUserId(
    req.params.userId,
    getAdminAuditContext(req)
  );
  res.json({ success: true, customer });
}

async function deleteCustomer(req, res) {
  const customer = await adminCustomersService.softDeleteCustomerByUserId(
    req.params.userId,
    getAdminAuditContext(req)
  );
  res.json({ success: true, customer });
}

async function approveProvider(req, res) {
  const provider = await providerService.approveProviderByUserId(
    req.params.userId,
    getAdminAuditContext(req)
  );
  res.json({ success: true, provider });
}

async function rejectProvider(req, res) {
  const reason = req.body?.reason || req.body?.rejectionReason;
  const provider = await providerService.rejectProviderByUserId(
    req.params.userId,
    reason,
    getAdminAuditContext(req)
  );
  res.json({ success: true, provider });
}

async function unrejectProvider(req, res) {
  const provider = await providerService.unrejectProviderByUserId(
    req.params.userId,
    getAdminAuditContext(req)
  );
  res.json({ success: true, provider });
}

async function blockProvider(req, res) {
  const provider = await providerService.blockProviderByUserId(
    req.params.userId,
    { ...getAdminAuditContext(req), reason: req.body?.reason }
  );
  res.json({ success: true, provider });
}

async function unblockProvider(req, res) {
  const provider = await providerService.unblockProviderByUserId(
    req.params.userId,
    getAdminAuditContext(req)
  );
  res.json({ success: true, provider });
}

async function deleteProvider(req, res) {
  const provider = await providerService.softDeleteProviderByUserId(req.params.userId);
  res.json({ success: true, provider });
}

async function approveProviderDocument(req, res) {
  const docType = String(req.params.docType || "").trim();
  const provider = await providerService.approveProviderDocumentByUserId(
    req.params.userId,
    docType,
    getAdminAuditContext(req)
  );
  res.json({ success: true, provider });
}

async function getAnalytics(req, res) {
  const data = await adminAnalyticsService.getAnalytics(req.query || {});
  res.json({ success: true, ...data });
}

async function getAnalyticsFilterOptions(_req, res) {
  const options = await adminAnalyticsFilterOptionsService.getFilterOptions();
  res.json({ success: true, ...options });
}

async function getPlatformHealth(_req, res) {
  const health = await platformHealthService.getPlatformHealth();
  res.json({ success: true, ...health });
}

async function rejectProviderDocument(req, res) {
  const docType = String(req.params.docType || "").trim();
  const feedback = req.body?.feedback ?? req.body?.reason ?? "";
  const provider = await providerService.rejectProviderDocumentByUserId(
    req.params.userId,
    docType,
    feedback,
    getAdminAuditContext(req)
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
  const data = await withdrawalAdminService.listWithdrawals({
    search: req.query.search,
    status: req.query.status,
  });
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
  let analyticsBySupplierId = new Map();
  try {
    [globalSupplierOrderAnalytics, analyticsBySupplierId] = await Promise.all([
      materialOrderService.aggregatePaidMaterialOrders({}),
      materialOrderService.aggregatePaidMaterialOrdersBySupplier(),
    ]);
  } catch (err) {
    console.error("[admin.listSuppliers] aggregate material orders failed", err);
    globalSupplierOrderAnalytics = {
      orderCount: 0,
      totalRevenue: 0,
      totalCommission: 0,
      averageOrderValue: 0,
      commissionRate: 0.07,
    };
    analyticsBySupplierId = new Map();
  }
  const suppliersWithAnalytics = suppliers.map((s) => ({
    ...s,
    orderAnalytics: analyticsBySupplierId.get(String(s.id)) ?? {
      orderCount: 0,
      totalRevenue: 0,
      totalCommission: 0,
      averageOrderValue: 0,
      commissionRate: 0.07,
    },
  }));
  res.json({
    success: true,
    suppliers: suppliersWithAnalytics,
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
    analytics = await materialOrderService.aggregatePaidMaterialOrders({ supplierId });
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

async function getAdminSupplierBranchWithdrawals(req, res) {
  const supplierId = String(req.params.supplierId || "").trim();
  if (!supplierId) {
    throw new AppError("supplierId is required", 400);
  }
  const supplier = await supplierService.getSupplierDetailsForAdmin(supplierId);
  if (!supplier) {
    throw new AppError("Supplier not found", 404);
  }
  const data = await branchAccountService.listSupplierOrgBranchWithdrawals(supplierId, {
    from: req.query.from,
    to: req.query.to,
    branchId: req.query.branchId,
  });
  res.json({ success: true, ...data });
}

async function getAdminSupplierAvailableWithdrawals(req, res) {
  const supplierId = String(req.params.supplierId || "").trim();
  if (!supplierId) {
    throw new AppError("supplierId is required", 400);
  }
  const supplier = await supplierService.getSupplierDetailsForAdmin(supplierId);
  if (!supplier) {
    throw new AppError("Supplier not found", 404);
  }
  const branchSettlement = require("../services/branchSettlement.service");
  const summary = await branchSettlement.aggregateSupplierSettlementSummary(supplierId, {
    from: req.query.from || undefined,
    to: req.query.to || undefined,
  });
  res.json({
    success: true,
    totalPendingSettlement: summary.totalPendingSettlement,
    totalSettled: summary.totalSettled,
    gatewaySettlementSupported: summary.gatewaySettlementSupported,
    byBranchId: summary.byBranchId,
  });
}

async function getAdminSupplierSettlementSummary(req, res) {
  return getAdminSupplierAvailableWithdrawals(req, res);
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

async function listAdminDisputes(req, res) {
  const data = await disputeAdminService.listDisputes({
    search: req.query.search,
    status: req.query.status,
    requestedResolution: req.query.requestedResolution,
  });
  res.json({ success: true, ...data });
}

async function getAdminDisputeDetail(req, res) {
  const data = await disputeAdminService.getDisputeDetail(req.params.id);
  res.json({ success: true, ...data });
}

async function updateAdminDisputeStatus(req, res) {
  const data = await disputeAdminService.updateDisputeStatus(
    req.user.userId,
    req.params.id,
    req.body?.status,
    req.body?.adminNotes
  );
  res.json({ success: true, ...data });
}

async function resolveAdminDispute(req, res) {
  const data = await disputeAdminService.resolveDispute(req.user.userId, req.params.id, req.body || {}, {
    idempotencyKey: req.financialIdempotencyKey,
    requestHash: req.financialRequestHash,
    route: req.financialIdempotencyRoute,
  });
  res.json({ success: true, ...data });
}

async function exportJobCompletionEvidence(req, res) {
  await disputeAdminService.streamEvidenceZip(req.params.jobId, res);
}

async function getAdminJobCompletionEvidence(req, res) {
  const jobCompletionEvidence = require("../services/jobCompletionEvidence.service");
  const evidence = await jobCompletionEvidence.getEvidenceByJobId(req.params.jobId);
  res.json({ success: true, evidence });
}

async function getAdminJobCaseSummary(req, res) {
  const summary = await disputeAdminService.getAdminJobCaseSummary(req.params.jobId);
  res.json({ success: true, summary });
}

async function getProviderTrustScore(req, res) {
  const providerTrustScore = require("../services/providerTrustScore.service");
  const providerService = require("../services/provider.service");
  const userId = await providerService.resolveProviderUserIdFromRouteParam(req.params.userId);
  if (!userId) {
    return res.status(404).json({ success: false, message: "Provider not found" });
  }
  const row = await prisma.provider.findUnique({ where: { userId }, select: { id: true } });
  if (!row) {
    return res.status(404).json({ success: false, message: "Provider not found" });
  }
  const trust = await providerTrustScore.getTrustScoreForProviderProfile(row.id);
  res.json({ success: true, trustScore: trust });
}

async function getFraudCenterSummary(req, res) {
  const fraudAlert = require("../services/fraudAlert.service");
  const summary = await fraudAlert.getSummaryCounts();
  res.json({ success: true, summary });
}

async function listFraudAlerts(req, res) {
  const fraudAlert = require("../services/fraudAlert.service");
  const data = await fraudAlert.listAlerts({
    status: req.query.status,
    severity: req.query.severity,
    alertType: req.query.alertType,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.json({ success: true, ...data });
}

async function getFraudAlertDetail(req, res) {
  const fraudAlert = require("../services/fraudAlert.service");
  const alert = await fraudAlert.getAlertById(req.params.id);
  if (!alert) {
    return res.status(404).json({ success: false, message: "Alert not found" });
  }
  res.json({ success: true, alert });
}

async function patchFraudAlert(req, res) {
  const fraudAlert = require("../services/fraudAlert.service");
  const alert = await fraudAlert.updateAlertStatus(req.params.id, {
    status: req.body?.status,
    reviewedBy: req.user?.userId,
    notes: req.body?.notes,
  });
  res.json({ success: true, alert });
}

async function getFraudDuplicatePhones(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const items = await fraudCenterAdmin.getDuplicatePhones();
  res.json({ success: true, items });
}

async function getFraudDuplicateIds(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const items = await fraudCenterAdmin.getDuplicateIds();
  res.json({ success: true, items });
}

async function getFraudDuplicateCompanies(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const data = await fraudCenterAdmin.getDuplicateCompanies();
  res.json({ success: true, ...data });
}

async function getFraudDuplicateBanks(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const items = await fraudCenterAdmin.getDuplicateBanks();
  res.json({ success: true, items });
}

async function getFraudSuspiciousDevices(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const items = await fraudCenterAdmin.listSuspiciousDevices();
  res.json({ success: true, items });
}

async function getFraudHighRiskProviders(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const items = await fraudCenterAdmin.getHighRiskProviders();
  res.json({ success: true, items });
}

async function getFraudFlaggedCustomers(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const items = await fraudCenterAdmin.getFlaggedCustomers();
  res.json({ success: true, items });
}

async function getFraudDeviceDetail(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const data = await fraudCenterAdmin.getDeviceDetail(req.params.id);
  if (!data) {
    return res.status(404).json({ success: false, message: "Device not found" });
  }
  res.json({ success: true, ...data });
}

async function patchProviderFraudReview(req, res) {
  const fraudCenterAdmin = require("../services/fraudCenterAdmin.service");
  const provider = await fraudCenterAdmin.updateProviderFraudReview(req.params.userId, {
    status: req.body?.status,
    adminId: req.user?.userId,
  });
  res.json({ success: true, provider });
}

const auditLogAdminService = require("../services/auditLogAdmin.service");

async function listAuditLogs(req, res) {
  const data = await auditLogAdminService.listAuditLogs(req.query || {});
  res.json({ success: true, ...data });
}

async function exportAuditLogs(req, res) {
  const { csv, truncated, rowCount } = await auditLogAdminService.exportAuditLogsCsv(req.query || {});
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="audit-logs.csv"');
  if (truncated) {
    res.setHeader("X-Export-Truncated", "true");
    res.setHeader("X-Export-Row-Count", String(rowCount));
  }
  res.send(csv);
}

async function listRefundRepayments(req, res) {
  const refundRecovery = require("../services/refundRecovery.service");
  const rows = await refundRecovery.listAdminRefundRepayments(req.query || {});
  res.json({ success: true, repayments: rows });
}

async function confirmRefundRepayment(req, res) {
  const refundRecovery = require("../services/refundRecovery.service");
  const data = await refundRecovery.confirmAdminRefundRepayment(req.user.userId, req.params.id, req.body || {});
  res.json({ success: true, ...data });
}

async function rejectRefundRepayment(req, res) {
  const refundRecovery = require("../services/refundRecovery.service");
  const row = await refundRecovery.rejectAdminRefundRepayment(req.user.userId, req.params.id, req.body || {});
  res.json({ success: true, repayment: row });
}

async function processCustomerRefundFromRepayment(req, res) {
  const refundRecovery = require("../services/refundRecovery.service");
  const data = await refundRecovery.processAdminCustomerRefund(req.user.userId, req.params.id);
  res.json({ success: true, ...data });
}

async function repairStaleCourierJobs(req, res) {
  const limit = req.body?.limit != null ? Number(req.body.limit) : 200;
  const result = await materialOrderService.repairAllStaleCourierJobs({ limit });
  res.json({ success: true, ...result });
}

async function getProviderPayoutProfile(req, res) {
  const payoutDestinationService = require("../services/payoutDestination.service");
  const prisma = require("../config/prisma");
  const userId = String(req.params.userId || "").trim();
  const provider = await prisma.provider.findUnique({ where: { userId }, select: { id: true } });
  if (!provider) throw new AppError("Provider not found", 404);
  const profile = await prisma.providerWithdrawalProfile.findUnique({
    where: { providerId: provider.id },
  });
  res.json({
    success: true,
    profile: payoutDestinationService.toMaskedAdminProfile(profile, "provider", provider.id),
    gatewaySettlementSupported: payoutDestinationService.gatewaySettlementSupported(),
  });
}

async function getBranchPayoutProfile(req, res) {
  const payoutDestinationService = require("../services/payoutDestination.service");
  const prisma = require("../config/prisma");
  const supplierId = String(req.params.supplierId || "").trim();
  const branchId = String(req.params.branchId || "").trim();
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, supplierId },
    select: { id: true },
  });
  if (!branch) throw new AppError("Branch not found", 404);
  const profile = await prisma.branchWithdrawalProfile.findUnique({
    where: { branchId: branch.id },
  });
  res.json({
    success: true,
    profile: payoutDestinationService.toMaskedAdminProfile(profile, "branch", branch.id),
    gatewaySettlementSupported: payoutDestinationService.gatewaySettlementSupported(),
  });
}

async function listPaymentObligations(req, res) {
  const obligationService = require("../services/customerPaymentObligation.service");
  const prisma = require("../config/prisma");
  const overdueOnly = String(req.query?.overdueOnly || "") === "true";
  const customerObligations = await obligationService.listOpenObligationsForAdmin({
    overdueOnly,
    status: req.query?.status,
  });
  let providerRefundDebts = [];
  try {
    const recoveries = await prisma.refundRecovery.findMany({
      where: overdueOnly
        ? { status: "OVERDUE" }
        : { status: { in: ["PENDING", "PARTIALLY_RECOVERED", "OVERDUE"] } },
      orderBy: { dueAt: "asc" },
      take: 200,
      include: {
        provider: {
          select: {
            id: true,
            userId: true,
            blocked: true,
            refundDebtBlockedAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        job: { select: { id: true, title: true } },
      },
    });
    providerRefundDebts = recoveries.map((row) => {
      const amountDue = Number(row.totalPending) - Number(row.recoveredAmount);
      return {
        id: row.id,
        providerId: row.providerId,
        providerUserId: row.provider?.userId || null,
        providerName: row.provider?.user?.name || null,
        providerEmail: row.provider?.user?.email || null,
        jobId: row.jobId,
        jobTitle: row.job?.title || null,
        amountDue,
        dueAt: row.dueAt,
        status: row.status,
        restrictionActive: Boolean(row.provider?.refundDebtBlockedAt),
      };
    });
  } catch (_e) {
    providerRefundDebts = [];
  }
  res.json({ success: true, customerObligations, providerRefundDebts });
}

async function listPendingPayoutProfiles(req, res) {
  const payoutDestinationService = require("../services/payoutDestination.service");
  const data = await payoutDestinationService.listPendingVerificationProfiles();
  res.json({ success: true, ...data });
}

module.exports = {
  listProviders,
  listProviderNetRevenues,
  getProviderAnalytics,
  listCustomers,
  getCustomerById,
  blockCustomer,
  unblockCustomer,
  deleteCustomer,
  getAnalytics,
  getAnalyticsFilterOptions,
  getPlatformHealth,
  approveProvider,
  rejectProvider,
  unrejectProvider,
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
  getAdminSupplierBranchWithdrawals,
  getAdminSupplierAvailableWithdrawals,
  getAdminSupplierSettlementSummary,
  listSupplierMaterialOrders,
  listAllPlatformMaterialOrders,
  listAdminDisputes,
  getAdminDisputeDetail,
  updateAdminDisputeStatus,
  resolveAdminDispute,
  exportJobCompletionEvidence,
  getAdminJobCompletionEvidence,
  getAdminJobCaseSummary,
  getProviderTrustScore,
  getFraudCenterSummary,
  listFraudAlerts,
  getFraudAlertDetail,
  patchFraudAlert,
  getFraudDuplicatePhones,
  getFraudDuplicateIds,
  getFraudDuplicateCompanies,
  getFraudDuplicateBanks,
  getFraudSuspiciousDevices,
  getFraudHighRiskProviders,
  getFraudFlaggedCustomers,
  getFraudDeviceDetail,
  patchProviderFraudReview,
  listAuditLogs,
  exportAuditLogs,
  listRefundRepayments,
  confirmRefundRepayment,
  rejectRefundRepayment,
  processCustomerRefundFromRepayment,
  processAdminJobRefund,
  repairStaleCourierJobs,
  getProviderPayoutProfile,
  getBranchPayoutProfile,
  listPendingPayoutProfiles,
  listPaymentObligations,
};
