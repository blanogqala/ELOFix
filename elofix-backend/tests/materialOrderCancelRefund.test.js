const assert = require("node:assert/strict");
const {
  allocateMaterialCancelRefunds,
  intentPaysForMaterialOrder,
} = require("../src/utils/materialOrderCancelRefund.util");

const materials = { id: "mat", kind: "MATERIAL_ORDER", amount: 100, materialOrderId: "order-1" };
const delivery = { id: "del", kind: "DELIVERY_FEE", amount: 20, materialOrderId: "order-1" };
const jobStore = {
  id: "job",
  kind: "JOB_STORE_ORDER",
  amount: 100,
  materialOrderId: null,
  gatewayPayload: { orderId: "order-1" },
};

assert.deepEqual(allocateMaterialCancelRefunds([materials], 100), [{ intentId: "mat", amount: 100 }]);
assert.deepEqual(
  allocateMaterialCancelRefunds([materials], 93),
  [{ intentId: "mat", amount: 93 }],
  "customer cancel keeps the platform commission on the captured charge"
);
assert.deepEqual(allocateMaterialCancelRefunds([delivery, materials], 120), [
  { intentId: "mat", amount: 100 },
  { intentId: "del", amount: 20 },
]);
assert.deepEqual(allocateMaterialCancelRefunds([delivery, materials], 111.6), [
  { intentId: "mat", amount: 100 },
  { intentId: "del", amount: 11.6 },
]);
assert.deepEqual(allocateMaterialCancelRefunds([materials], 250), [{ intentId: "mat", amount: 100 }]);
assert.deepEqual(allocateMaterialCancelRefunds([materials], 0), []);
assert.deepEqual(allocateMaterialCancelRefunds([jobStore, delivery], 120), [
  { intentId: "job", amount: 100 },
  { intentId: "del", amount: 20 },
]);

assert.equal(intentPaysForMaterialOrder(materials, "order-1"), true);
assert.equal(intentPaysForMaterialOrder(jobStore, "order-1"), true);
assert.equal(intentPaysForMaterialOrder(jobStore, "order-2"), false);
assert.equal(
  intentPaysForMaterialOrder({ id: "other", kind: "JOB_STORE_ORDER", gatewayPayload: { orderId: "order-2" } }, "order-1"),
  false
);
assert.equal(intentPaysForMaterialOrder({ id: "bare", kind: "MATERIAL_ORDER" }, "order-1"), false);

console.log("materialOrderCancelRefund.test.js passed");
