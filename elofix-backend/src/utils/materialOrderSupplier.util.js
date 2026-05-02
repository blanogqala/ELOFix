/**
 * Resolve supplier store id when DB column is null but payload still carries storeId (legacy / partial writes).
 */

function payloadBackedSupplierId(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const fromRoot = String(p.storeId || "").trim();
  if (fromRoot) return fromRoot;
  const mb = p.materialBatch && typeof p.materialBatch === "object" ? p.materialBatch : {};
  const fromMb = String(mb.supplierId || "").trim();
  if (fromMb) return fromMb;
  const scanItems = (arr) => {
    if (!Array.isArray(arr)) return "";
    for (const it of arr) {
      if (!it || typeof it !== "object") continue;
      const s = String(it.supplierId || "").trim();
      if (s) return s;
    }
    return "";
  };
  const fromItems = scanItems(p.items);
  if (fromItems) return fromItems;
  return scanItems(mb.items);
}

function effectiveMaterialOrderSupplierId(row) {
  if (!row) return "";
  const col = String(row.supplierId || "").trim();
  if (col) return col;
  const pl = row.payload && typeof row.payload === "object" ? row.payload : {};
  return payloadBackedSupplierId(pl);
}

/** Portal / tracking: column may be null or wrong while payload still names the store (Supplier.id). */
function materialOrderBelongsToSupplierStore(row, supplierStoreId) {
  const sid = String(supplierStoreId || "").trim();
  if (!row || !sid) return false;
  if (String(row.supplierId || "").trim() === sid) return true;
  const pl = row.payload && typeof row.payload === "object" ? row.payload : {};
  return payloadBackedSupplierId(pl) === sid;
}

module.exports = {
  payloadBackedSupplierId,
  effectiveMaterialOrderSupplierId,
  materialOrderBelongsToSupplierStore,
};
