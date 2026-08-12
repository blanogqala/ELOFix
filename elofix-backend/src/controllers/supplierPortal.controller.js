const AppError = require("../utils/AppError");
const { registerUploadedFile } = require("../services/fileStorage.service");
const { validateUploadedImageFile } = require("../utils/uploadSecurity.util");
const supplierService = require("../services/supplier.service");
const materialOrderService = require("../services/materialOrder.service");
const supplierAnalyticsService = require("../services/supplierAnalytics.service");

async function portalActor(req) {
  if (req.user.role === "SUPPLIER") {
    const row = await supplierService.requireSupplierOwnedByUserId(req.user.userId);
    return { kind: "SUPPLIER", supplierOrgId: row.id, branchScopeId: null, userId: req.user.userId };
  }
  if (req.user.role === "BRANCH_STAFF") {
    const org = String(req.user.supplierOrgId || "").trim();
    const bid = String(req.user.branchId || "").trim();
    if (!org || !bid) {
      throw new AppError("Invalid session", 401);
    }
    return { kind: "BRANCH_STAFF", supplierOrgId: org, branchScopeId: bid, userId: req.user.userId };
  }
  throw new AppError("Forbidden", 403);
}

function effectiveOrdersBranchFilter(actor, queryBranchId) {
  if (actor.branchScopeId) {
    return actor.branchScopeId;
  }
  const q = String(queryBranchId || "").trim();
  return q || undefined;
}

/** Supplier org owner may view orders but not mutate fulfillment (branch staff only). */
function assertBranchStaffCanMutateOrders(req) {
  if (req.user.role === "SUPPLIER") {
    throw new AppError("Order updates are handled by branch staff", 403);
  }
}

async function postInventoryCategory(req, res) {
  const branchId = String(req.query.branchId || req.body?.branchId || "").trim();
  const category = await supplierService.createInventoryCategoryForPortal(req.user, req.body?.name, branchId);
  return res.status(201).json({ success: true, category });
}

async function getInventoryCategories(req, res) {
  const branchId = String(req.query.branchId || "").trim();
  const categories = await supplierService.listInventoryCategoriesForPortal(req.user, branchId);
  res.json({ success: true, categories });
}

async function getMe(req, res) {
  if (req.user.role === "BRANCH_STAFF") {
    const profile = await supplierService.getBranchStaffPortalProfile(req.user.userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: "Branch profile missing" });
    }
    return res.json({ success: true, profile });
  }
  const profile = await supplierService.getSupplierProfileByUserId(req.user.userId);
  if (!profile) {
    return res.status(404).json({ success: false, message: "Supplier profile missing" });
  }
  res.json({ success: true, profile });
}

async function patchBranchMe(req, res) {
  if (req.user.role !== "BRANCH_STAFF") {
    throw new AppError("Forbidden", 403);
  }
  const profile = await supplierService.patchBranchForBranchStaff(req.user.userId, req.body || {});
  if (!profile) {
    return res.status(404).json({ success: false, message: "Branch profile missing" });
  }
  res.json({ success: true, profile });
}

async function getAnalyticsOverview(req, res) {
  const actor = await portalActor(req);
  const data =
    actor.kind === "SUPPLIER"
      ? await supplierAnalyticsService.getSupplierOverview(actor.supplierOrgId)
      : await supplierAnalyticsService.getBranchStaffOverview(actor.supplierOrgId, actor.branchScopeId);
  res.json({ success: true, ...data });
}

async function getAnalyticsBranches(req, res) {
  const row = await supplierService.requireSupplierOwnedByUserId(req.user.userId);
  const result = await supplierAnalyticsService.listBranchesWithStats(row.id, {
    city: req.query.city,
    q: req.query.q,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({
    success: true,
    branches: result.branches,
    totalPendingSettlement: result.totalPendingSettlement,
    totalSettled: result.totalSettled,
    gatewaySettlementSupported: result.gatewaySettlementSupported,
  });
}

async function getAnalyticsBranchInventory(req, res) {
  const row = await supplierService.requireSupplierOwnedByUserId(req.user.userId);
  const data = await supplierAnalyticsService.getBranchInventoryInsights(row.id, req.params.branchId);
  res.json({ success: true, ...data });
}

async function getOrders(req, res) {
  const actor = await portalActor(req);
  const status = req.query.status || undefined;
  const from = req.query.from || undefined;
  const to = req.query.to || undefined;
  const branchId = effectiveOrdersBranchFilter(actor, req.query.branchId);
  const orders = await materialOrderService.listMaterialOrdersBySupplier(actor.supplierOrgId, {
    fulfillmentStatus: status,
    from,
    to,
    branchId,
  });
  try {
    console.log(
      JSON.stringify({
        ns: "supplier_portal",
        event: "get_orders_response",
        supplierId: actor.supplierOrgId,
        count: orders.length,
        statusFilter: status ?? null,
        at: new Date().toISOString(),
      })
    );
  } catch (_) {
    /* ignore */
  }
  res.json({ success: true, orders });
}

async function getOrdersExport(req, res) {
  const actor = await portalActor(req);
  const branchId = effectiveOrdersBranchFilter(actor, req.query.branchId);
  const out = await materialOrderService.buildSupplierOrdersExport(actor.supplierOrgId, {
    from: req.query.from || undefined,
    to: req.query.to || undefined,
    branchId,
  });
  res.json({ success: true, ...out });
}

async function patchFulfillment(req, res) {
  assertBranchStaffCanMutateOrders(req);
  const actor = await portalActor(req);
  const nextStatus = req.body?.status;
  const order = await materialOrderService.updateMaterialOrderFulfillment(
    req.params.orderId,
    actor.supplierOrgId,
    nextStatus,
    actor.branchScopeId ? { branchScopeId: actor.branchScopeId } : {}
  );
  res.json({ success: true, order });
}

async function cancelOrder(req, res) {
  assertBranchStaffCanMutateOrders(req);
  const actor = await portalActor(req);
  const reason = String(req.body?.reason || "").trim();
  if (!reason) {
    throw new AppError("Cancellation reason is required", 400);
  }
  const out = await materialOrderService.cancelMaterialOrderAsSupplier(
    req.params.orderId,
    actor.supplierOrgId,
    actor.userId,
    reason,
    actor.branchScopeId ? { branchScopeId: actor.branchScopeId } : {}
  );
  res.json({ success: true, order: out.order, refund: out.refund });
}

async function postEnsureTracking(req, res) {
  assertBranchStaffCanMutateOrders(req);
  const actor = await portalActor(req);
  const session = await materialOrderService.ensureStoreDeliveryTrackingSession(
    req.params.orderId,
    actor.supplierOrgId,
    actor.branchScopeId ? { branchScopeId: actor.branchScopeId } : {}
  );
  res.json({ success: true, ...session });
}

async function postOrderNote(req, res) {
  assertBranchStaffCanMutateOrders(req);
  const actor = await portalActor(req);
  const opts =
    actor.branchScopeId && actor.supplierOrgId
      ? { branchScopeId: actor.branchScopeId, supplierOrgId: actor.supplierOrgId }
      : {};
  const order = await materialOrderService.appendSupplierOrderNote(
    req.params.orderId,
    actor.userId,
    req.body?.message,
    opts
  );
  res.json({ success: true, order });
}

async function patchDeliveryApprove(req, res) {
  assertBranchStaffCanMutateOrders(req);
  const actor = await portalActor(req);
  const fee = req.body?.fee;
  const note = req.body?.note;
  const order = await materialOrderService.approveMaterialOrderDeliveryBySupplier(
    req.params.orderId,
    actor.supplierOrgId,
    {
      branchScopeId: actor.branchScopeId || undefined,
      userId: actor.userId,
      fee,
      note,
    }
  );
  res.json({ success: true, order });
}

async function patchDeliveryReject(req, res) {
  assertBranchStaffCanMutateOrders(req);
  const actor = await portalActor(req);
  const order = await materialOrderService.rejectMaterialOrderDeliveryBySupplier(
    req.params.orderId,
    actor.supplierOrgId,
    {
      branchScopeId: actor.branchScopeId || undefined,
      userId: actor.userId,
      reason: req.body?.reason,
    }
  );
  res.json({ success: true, order });
}

async function postProduct(req, res) {
  const supplier = await supplierService.upsertSupplierProductForPortal(req.user, req.body || {});
  return res.status(201).json({ success: true, supplier });
}

async function patchProduct(req, res) {
  const supplier = await supplierService.updateSupplierProductForPortal(req.user, req.params.productId, req.body || {});
  res.json({ success: true, supplier });
}

async function deleteProduct(req, res) {
  const branchId = String(req.query.branchId || "").trim();
  const supplier = await supplierService.deleteSupplierProductForPortal(req.user, req.params.productId, branchId);
  res.json({ success: true, supplier });
}

async function patchProfile(req, res) {
  const profile = await supplierService.updateSupplierBusinessProfile(req.user.userId, req.body || {});
  res.json({ success: true, profile });
}

async function uploadProductImage(req, res) {
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  await validateUploadedImageFile(req.file);
  const stored = await registerUploadedFile(req.file, {
    ownerUserId: req.user.userId,
    type: "supplier_product",
  });
  res.json({ success: true, fileId: stored.fileId, url: stored.url });
}

async function uploadLogo(req, res) {
  if (!req.file) {
    throw new AppError("File is required", 400);
  }
  await validateUploadedImageFile(req.file);
  const stored = await registerUploadedFile(req.file, {
    ownerUserId: req.user.userId,
    type: "supplier_logo",
  });
  const profile = await supplierService.updateSupplierBusinessProfile(req.user.userId, { logo: stored.url });
  res.json({ success: true, fileId: stored.fileId, url: stored.url, profile });
}

module.exports = {
  getMe,
  patchBranchMe,
  getAnalyticsOverview,
  getAnalyticsBranches,
  getAnalyticsBranchInventory,
  getInventoryCategories,
  postInventoryCategory,
  getOrders,
  getOrdersExport,
  patchFulfillment,
  patchDeliveryApprove,
  patchDeliveryReject,
  cancelOrder,
  postEnsureTracking,
  postOrderNote,
  postProduct,
  patchProduct,
  deleteProduct,
  patchProfile,
  uploadProductImage,
  uploadLogo,
};
