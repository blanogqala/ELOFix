/**
 * Job-store materials checkout must ignore a courier base rate stored on the order.
 * Delivery is quoted and paid separately. Run: node tests/jobStoreOrderAmount.test.js
 */
const assert = require("assert");
const {
  jobStoreChargeTotal,
  jobStorePaidAmountCoversMaterials,
} = require("../src/utils/jobStoreOrderAmount.util");

const order = {
  orderId: "order-1",
  storeId: "branch-1",
  items: [
    { qty: 2, unitPrice: 100 },
    { qty: 1, price: 50 },
  ],
  deliveryType: "PROVIDER",
  deliveryFee: 80,
  delivery: { fee: 80, type: "PROVIDER" },
};

assert.strictEqual(jobStoreChargeTotal(order), 250);
assert.strictEqual(jobStorePaidAmountCoversMaterials(250, order, 80), true);
assert.strictEqual(jobStorePaidAmountCoversMaterials(330, order, 80), true);
assert.strictEqual(jobStorePaidAmountCoversMaterials(80, order, 80), false);
assert.strictEqual(jobStorePaidAmountCoversMaterials(249.99, order, 80), true);
assert.strictEqual(jobStorePaidAmountCoversMaterials(249.97, order, 80), false);

const selfCollect = {
  items: [{ qty: 1, unitPrice: 40 }],
  deliveryType: "SELF",
  deliveryFee: 0,
};
assert.strictEqual(jobStoreChargeTotal(selfCollect), 40);
assert.strictEqual(jobStorePaidAmountCoversMaterials(40, selfCollect, 0), true);
assert.strictEqual(jobStorePaidAmountCoversMaterials(0, order, 80), false);
assert.strictEqual(jobStorePaidAmountCoversMaterials(55, selfCollect, 15), false);
assert.strictEqual(jobStorePaidAmountCoversMaterials(40.01, selfCollect, 15), true);

console.log("jobStoreOrderAmount.test.js: OK");
