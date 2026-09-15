/**
 * Payout notification targeting (no settlement math, no Prisma).
 * Run: node tests/paystack.payoutNotify.test.js
 */
const assert = require("assert");
const { resolvePayoutStaffNotifyBranchId } = require("../src/services/payments/payoutTransparency.util");

function testStaffBranchIdFromIntent() {
  const branchId = resolvePayoutStaffNotifyBranchId(
    { kind: "MATERIAL_ORDER", branchId: "branch-a" },
    { branchId: "branch-b" }
  );
  assert.strictEqual(branchId, "branch-a");
}

function testStaffBranchIdFallbackFromMaterialOrder() {
  const branchId = resolvePayoutStaffNotifyBranchId({ kind: "JOB_STORE_ORDER" }, { branchId: "branch-b" });
  assert.strictEqual(branchId, "branch-b");
}

function testProviderPayoutDoesNotFanOutToBranchStaff() {
  const branchId = resolvePayoutStaffNotifyBranchId(
    { kind: "LABOR", branchId: "branch-a", recipientUserId: "prov-1" },
    { branchId: "branch-a" }
  );
  assert.strictEqual(branchId, null);
}

function testCourierDeliveryFeeDoesNotFanOutToBranchStaff() {
  const branchId = resolvePayoutStaffNotifyBranchId(
    { kind: "DELIVERY_FEE", branchId: "branch-a" },
    { branchId: "branch-a" }
  );
  assert.strictEqual(branchId, null);
}

function testMissingBranchYieldsNoStaffNotify() {
  const branchId = resolvePayoutStaffNotifyBranchId({ kind: "MATERIAL_ORDER" }, null);
  assert.strictEqual(branchId, null);
}

testStaffBranchIdFromIntent();
testStaffBranchIdFallbackFromMaterialOrder();
testProviderPayoutDoesNotFanOutToBranchStaff();
testCourierDeliveryFeeDoesNotFanOutToBranchStaff();
testMissingBranchYieldsNoStaffNotify();
console.log("paystack.payoutNotify.test.js: OK");
