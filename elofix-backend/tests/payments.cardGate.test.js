/**
 * CVV format helper (used by rejection/redaction tests — EloFix no longer accepts CVV in production APIs).
 * Run: node tests/payments.cardGate.test.js
 */
const assert = require("assert");
const { isValidCvv } = require("../src/utils/paymentCard.util");

function testIsValidCvv() {
  assert.strictEqual(isValidCvv("123"), true);
  assert.strictEqual(isValidCvv("1234"), true);
  assert.strictEqual(isValidCvv("12"), false);
  assert.strictEqual(isValidCvv("12345"), false);
  assert.strictEqual(isValidCvv(""), false);
  assert.strictEqual(isValidCvv(null), false);
  assert.strictEqual(isValidCvv("12a"), false);
}

testIsValidCvv();
console.log("payments.cardGate.test.js: OK");
