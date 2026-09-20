/**
 * Supplier settlement UI mapping — PENDING / PROCESSING / SUCCESS.
 * Run: node tests/supplierSettlementPresentation.util.test.js
 */
const assert = require("assert");
const {
  mapPayoutStatusToSupplierSettlementUi,
  pickAuthoritativeMaterialsIntent,
  resolveSupplierOrderSettlement,
} = require("../src/utils/supplierSettlementPresentation.util");

function main() {
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("PENDING"), "PENDING");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("PROCESSING"), "PROCESSING");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("SETTLED"), "SUCCESS");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("FAILED"), "PENDING");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("REVERSED"), "PENDING");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi("NOT_SUPPORTED"), "PENDING");
  assert.strictEqual(mapPayoutStatusToSupplierSettlementUi(null), "PENDING");

  const picked = pickAuthoritativeMaterialsIntent([
    { kind: "DELIVERY_FEE", payoutSettlementStatus: "SETTLED" },
    { kind: "JOB_STORE_ORDER", payoutSettlementStatus: "PROCESSING" },
    { kind: "MATERIAL_ORDER", payoutSettlementStatus: "PENDING" },
  ]);
  assert.strictEqual(picked.kind, "MATERIAL_ORDER");
  assert.strictEqual(picked.payoutSettlementStatus, "PENDING");

  const jobStoreOnly = pickAuthoritativeMaterialsIntent([
    { kind: "DELIVERY_FEE", payoutSettlementStatus: "SETTLED" },
    { kind: "JOB_STORE_ORDER", payoutSettlementStatus: "SETTLED" },
  ]);
  assert.strictEqual(jobStoreOnly.kind, "JOB_STORE_ORDER");

  const noMaterials = pickAuthoritativeMaterialsIntent([
    { kind: "DELIVERY_FEE", payoutSettlementStatus: "SETTLED" },
  ]);
  assert.strictEqual(noMaterials, null);

  const fromIntent = resolveSupplierOrderSettlement(
    { payoutSettlementStatus: "SETTLED" },
    "PENDING"
  );
  assert.strictEqual(fromIntent.settlementStatus, "SUCCESS");
  assert.strictEqual(fromIntent.settlementRawStatus, "SETTLED");

  const fallback = resolveSupplierOrderSettlement(null, "PROCESSING");
  assert.strictEqual(fallback.settlementStatus, "PROCESSING");
  assert.strictEqual(fallback.settlementRawStatus, "PROCESSING");

  console.log("supplierSettlementPresentation.util.test.js: OK");
}

main();
