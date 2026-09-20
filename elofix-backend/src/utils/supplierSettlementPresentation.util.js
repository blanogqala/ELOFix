/**
 * Supplier-facing settlement presentation.
 * Does not change payout bookkeeping — maps authoritative payoutSettlementStatus
 * onto the three UI labels: PENDING | PROCESSING | SUCCESS.
 */

const MATERIALS_SETTLEMENT_KINDS = new Set(["MATERIAL_ORDER", "JOB_STORE_ORDER"]);

function normalizePayoutStatus(raw) {
  return String(raw || "").trim().toUpperCase();
}

/**
 * @param {string | null | undefined} rawStatus payoutSettlementStatus or MaterialOrder.settlementStatus
 * @returns {"PENDING" | "PROCESSING" | "SUCCESS"}
 */
function mapPayoutStatusToSupplierSettlementUi(rawStatus) {
  const s = normalizePayoutStatus(rawStatus);
  if (s === "SETTLED") return "SUCCESS";
  if (s === "PROCESSING" || s === "IN_PROGRESS" || s === "COMPLETE" || s === "COMPLETED") {
    return "PROCESSING";
  }
  return "PENDING";
}

function materialsIntentRank(kind) {
  const k = normalizePayoutStatus(kind);
  if (k === "MATERIAL_ORDER") return 0;
  if (k === "JOB_STORE_ORDER") return 1;
  return 9;
}

/**
 * Prefer MATERIAL_ORDER, then JOB_STORE_ORDER. Never pick DELIVERY_FEE for
 * the materials-order settlement column.
 * @param {Array<{ kind?: string }>} intents
 */
function pickAuthoritativeMaterialsIntent(intents) {
  const list = Array.isArray(intents) ? intents : [];
  const materials = list.filter((intent) =>
    MATERIALS_SETTLEMENT_KINDS.has(normalizePayoutStatus(intent?.kind))
  );
  if (!materials.length) return null;
  return [...materials].sort((a, b) => materialsIntentRank(a.kind) - materialsIntentRank(b.kind))[0];
}

function resolveSupplierOrderSettlement(intent, orderFallbackStatus) {
  const raw =
    intent && intent.payoutSettlementStatus != null && String(intent.payoutSettlementStatus).trim() !== ""
      ? intent.payoutSettlementStatus
      : orderFallbackStatus;
  return {
    settlementStatus: mapPayoutStatusToSupplierSettlementUi(raw),
    settlementRawStatus: raw != null && String(raw).trim() !== "" ? normalizePayoutStatus(raw) : null,
  };
}

module.exports = {
  MATERIALS_SETTLEMENT_KINDS,
  mapPayoutStatusToSupplierSettlementUi,
  pickAuthoritativeMaterialsIntent,
  resolveSupplierOrderSettlement,
};
