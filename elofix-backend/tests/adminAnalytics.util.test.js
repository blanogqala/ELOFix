/**
 * Admin analytics helper tests.
 * Run: node tests/adminAnalytics.util.test.js
 */
const assert = require("assert");
const {
  buildJobWhereClause,
  pctDelta,
} = require("../src/utils/adminAnalytics.util");

function testPctDelta() {
  assert.strictEqual(pctDelta(110, 100), 10);
  assert.strictEqual(pctDelta(90, 100), -10);
  assert.strictEqual(pctDelta(0, 0), 0);
  assert.strictEqual(pctDelta(5, 0), 100);
}

function testBuildJobWhereEmpty() {
  const where = buildJobWhereClause({});
  assert.deepStrictEqual(where, {});
}

function testBuildJobWhereCategory() {
  const where = buildJobWhereClause({ category: "PLUMBING" });
  assert.ok(where.AND);
  assert.ok(where.AND.some((c) => c.category?.equals === "PLUMBING"));
}

function testBuildJobWhereSearch() {
  const where = buildJobWhereClause({ search: "john" });
  assert.ok(where.AND);
  const searchClause = where.AND.find((c) => c.OR);
  assert.ok(searchClause);
  assert.ok(searchClause.OR.some((o) => o.title));
}

async function main() {
  testPctDelta();
  testBuildJobWhereEmpty();
  testBuildJobWhereCategory();
  testBuildJobWhereSearch();
  console.log("adminAnalytics.util.test.js: all tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
