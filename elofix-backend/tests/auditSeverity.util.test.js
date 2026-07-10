/**
 * Audit severity derivation tests.
 * Run: node tests/auditSeverity.util.test.js
 */
const assert = require("assert");
const { deriveSeverity } = require("../src/utils/auditSeverity.util");

function testCritical() {
  assert.strictEqual(deriveSeverity("reconcile.mismatch"), "critical");
  assert.strictEqual(deriveSeverity("auth.login.failed"), "critical");
  assert.strictEqual(deriveSeverity("fraud.alert.created"), "critical");
  assert.strictEqual(deriveSeverity("verification.customer.blocked"), "critical");
}

function testWarning() {
  assert.strictEqual(deriveSeverity("verification.provider.rejected"), "warning");
  assert.strictEqual(deriveSeverity("dispute.opened"), "warning");
  assert.strictEqual(deriveSeverity("upload.rate_limited"), "warning");
}

function testInfo() {
  assert.strictEqual(deriveSeverity("auth.login.success"), "info");
  assert.strictEqual(deriveSeverity("verification.provider.approved"), "info");
  assert.strictEqual(deriveSeverity("payment.pay_labor"), "info");
}

async function main() {
  testCritical();
  testWarning();
  testInfo();
  console.log("auditSeverity.util.test.js: all tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
