/**
 * Catalog prices are authoritative for material checkout.
 * Run: node tests/catalogPrice.test.js
 */
const assert = require("assert");
const {
  assertLinesMatchProductList,
  catalogPricesMatch,
} = require("../src/utils/catalogPrice.util");

const CEMENT = { id: "cement-1", name: "Cement", price: 120, category: "building" };
const SAND = { id: "sand-1", name: "Sand", price: 80.5, category: "building" };
const CATALOG = [CEMENT, SAND];

function rejects(fn, messagePart) {
  assert.throws(fn, (err) => {
    assert.strictEqual(err.statusCode, 400);
    assert.ok(String(err.message).includes(messagePart), err.message);
    return true;
  });
}

function testMatchingCheckoutPasses() {
  const total = assertLinesMatchProductList(
    CATALOG,
    [
      { productId: "cement-1", qty: 2, unitPrice: 120 },
      { productId: "sand-1", qty: 1, unitPrice: 80.5 },
    ],
    { materialsTotal: 320.5 }
  );
  assert.strictEqual(total, 320.5);
  assert.strictEqual(catalogPricesMatch(120, 120.01), true);
  assert.strictEqual(catalogPricesMatch(120, 120.03), false);
}

function testUnderpricedLineRejected() {
  rejects(
    () =>
      assertLinesMatchProductList(
        CATALOG,
        [{ productId: "cement-1", qty: 10, unitPrice: 1 }],
        { materialsTotal: 10 }
      ),
    "Item price does not match the store catalog"
  );
}

function testUnderstatedTotalRejected() {
  rejects(
    () =>
      assertLinesMatchProductList(
        CATALOG,
        [{ productId: "cement-1", qty: 2, unitPrice: 120 }],
        { materialsTotal: 1 }
      ),
    "Order total does not match the store catalog"
  );
}

function testUnknownProductRejected() {
  rejects(
    () =>
      assertLinesMatchProductList(
        CATALOG,
        [{ productId: "missing", qty: 1, unitPrice: 1 }],
        { materialsTotal: 1 }
      ),
    "not sold by this store"
  );
}

function testZeroQuantityRejected() {
  rejects(
    () =>
      assertLinesMatchProductList(CATALOG, [{ productId: "cement-1", qty: 0, unitPrice: 120 }]),
    "quantity"
  );
}

function testOmittedTotalStillChecksUnitPrice() {
  const total = assertLinesMatchProductList(CATALOG, [
    { productId: "cement-1", qty: 1, unitPrice: 120 },
  ]);
  assert.strictEqual(total, 120);
}

testMatchingCheckoutPasses();
testUnderpricedLineRejected();
testUnderstatedTotalRejected();
testUnknownProductRejected();
testZeroQuantityRejected();
testOmittedTotalStillChecksUnitPrice();
console.log("catalogPrice.test.js ok");
