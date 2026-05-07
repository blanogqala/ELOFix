const prisma = require("../config/prisma");

/**
 * Read branch id from payload only (explicit branchId / storeId / materialBatch.branchId).
 * Legacy paths that stored branch uuid in materialBatch.supplierId have been migrated at DB level.
 */
function payloadBackedBranchId(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const fromRoot = String(p.branchId || p.storeId || "").trim();
  if (fromRoot) return fromRoot;
  const mb = p.materialBatch && typeof p.materialBatch === "object" ? p.materialBatch : {};
  const fromMb = String(mb.branchId || "").trim();
  if (fromMb) return fromMb;
  const scanItems = (arr) => {
    if (!Array.isArray(arr)) return "";
    for (const it of arr) {
      if (!it || typeof it !== "object") continue;
      const s = String(it.branchId || "").trim();
      if (s) return s;
    }
    return "";
  };
  const fromItems = scanItems(p.items);
  if (fromItems) return fromItems;
  return scanItems(mb.items);
}

function effectiveMaterialOrderBranchId(row) {
  if (!row) return "";
  const col = String(row.branchId || "").trim();
  if (col) return col;
  const pl = row.payload && typeof row.payload === "object" ? row.payload : {};
  return payloadBackedBranchId(pl);
}

/** @deprecated use payloadBackedBranchId */
function payloadBackedSupplierId(payload) {
  return payloadBackedBranchId(payload);
}

/** @deprecated use effectiveMaterialOrderBranchId */
function effectiveMaterialOrderSupplierId(row) {
  return effectiveMaterialOrderBranchId(row);
}

/**
 * Portal: order belongs to supplier organization (MaterialOrder.supplierId or branch ownership).
 */
async function materialOrderBelongsToSupplierStore(row, supplierOrgId) {
  const org = String(supplierOrgId || "").trim();
  if (!row || !org) return false;
  if (String(row.supplierId || "").trim() === org) return true;
  const bid = String(row.branchId || "").trim();
  if (!bid) return false;
  const b = await prisma.branch.findUnique({ where: { id: bid }, select: { supplierId: true } });
  return Boolean(b && String(b.supplierId) === org);
}

module.exports = {
  payloadBackedBranchId,
  payloadBackedSupplierId,
  effectiveMaterialOrderBranchId,
  effectiveMaterialOrderSupplierId,
  materialOrderBelongsToSupplierStore,
};
