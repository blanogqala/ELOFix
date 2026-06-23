/**
 * Fraud engine unit tests (no DB).
 * Run: node tests/fraud.test.js
 */
const assert = require("assert");
const { normalizePhone } = require("../src/utils/phoneNormalization.util");
const { hashSaId, hashCompanyRegistration, hashBankAccount } = require("../src/utils/identityHash.util");
const { validateSaId } = require("../src/utils/saIdValidation.util");
const { getTrustLevel, isHighRisk } = require("../src/utils/trustLevel.util");

function testPhoneNormalization() {
  assert.strictEqual(normalizePhone("0821234567"), "+27821234567");
  assert.strictEqual(normalizePhone("+27 82 123 4567"), "+27821234567");
  assert.strictEqual(normalizePhone(""), null);
  assert.strictEqual(normalizePhone("123"), null);
}

function testSaIdValidation() {
  assert.strictEqual(validateSaId("8001015009087"), true);
  assert.strictEqual(validateSaId("8001015009088"), false);
  assert.strictEqual(validateSaId("123"), false);
}

function testIdentityHashing() {
  const h1 = hashSaId("8001015009087");
  const h2 = hashSaId("8001015009087");
  assert.strictEqual(h1, h2);
  assert.notStrictEqual(hashSaId("8001015009087"), hashSaId("9001015009087"));

  const c1 = hashCompanyRegistration("K2020/123456/07");
  const c2 = hashCompanyRegistration("k2020-123456-07");
  assert.strictEqual(c1, c2);

  const b1 = hashBankAccount("FNB", "250655", "62000000001");
  const b2 = hashBankAccount("fnb", "250655", "62000000001");
  assert.strictEqual(b1, b2);
}

function testTrustLevels() {
  assert.strictEqual(getTrustLevel(95).id, "elite");
  assert.strictEqual(getTrustLevel(80).id, "trusted");
  assert.strictEqual(getTrustLevel(65).id, "monitor");
  assert.strictEqual(getTrustLevel(50).id, "restricted");
  assert.strictEqual(getTrustLevel(20).id, "high_risk");
  assert.strictEqual(isHighRisk(39), true);
  assert.strictEqual(isHighRisk(40), false);
}

testPhoneNormalization();
testSaIdValidation();
testIdentityHashing();
testTrustLevels();
console.log("fraud.test.js: OK");
