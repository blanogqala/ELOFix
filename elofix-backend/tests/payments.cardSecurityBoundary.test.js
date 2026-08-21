/**
 * Card-data security boundary (Block 5).
 * Run: node tests/payments.cardSecurityBoundary.test.js
 */
const assert = require("assert");
const {
  redactSensitivePaymentFields,
  findRejectedCardCredentialKey,
} = require("../src/utils/paymentRedaction.util");
const { financialRequestFingerprint } = require("../src/utils/requestFingerprint");
const payfast = require("../src/services/payments/payfast.gateway");

function testRejectRawCredentials() {
  assert.strictEqual(findRejectedCardCredentialKey({ cvv: "123" }), "cvv");
  assert.strictEqual(findRejectedCardCredentialKey({ cvc: "123" }), "cvc");
  assert.strictEqual(findRejectedCardCredentialKey({ cardNumber: "4242424242424242" }), "cardNumber");
  assert.strictEqual(
    findRejectedCardCredentialKey({ number: "4242424242424242", expiryMonth: 12 }),
    "number"
  );
  assert.strictEqual(findRejectedCardCredentialKey({ amount: 100, provider: "PAYFAST" }), null);
  assert.strictEqual(findRejectedCardCredentialKey({ number: 42 }), null); // qty-like, no card context
}

function testRedaction() {
  const redacted = redactSensitivePaymentFields({
    kind: "LABOR",
    cvv: "123",
    cardNumber: "4242424242424242",
    amount: 50,
  });
  assert.strictEqual(redacted.cvv, "[REDACTED]");
  assert.strictEqual(redacted.cardNumber, "[REDACTED]");
  assert.strictEqual(redacted.amount, 50);
  assert.strictEqual(redacted.kind, "LABOR");
}

function testFingerprintDoesNotEmbedSecrets() {
  const a = financialRequestFingerprint("POST", "/api/payments/intents", {
    kind: "LABOR",
    cvv: "123",
  });
  const b = financialRequestFingerprint("POST", "/api/payments/intents", {
    kind: "LABOR",
    cvv: "999",
  });
  // After redaction both map to the same fingerprint (secrets do not diversify the hash).
  assert.strictEqual(a, b);
}

function testPayfastCheckoutHasNoCardFields() {
  const prevId = process.env.PAYFAST_MERCHANT_ID;
  const prevKey = process.env.PAYFAST_MERCHANT_KEY;
  const prevMode = process.env.PAYFAST_MODE;
  process.env.PAYFAST_MERCHANT_ID = "10000100";
  process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
  process.env.PAYFAST_MODE = "sandbox";
  try {
    const checkout = payfast.createCheckout(
      {
        id: "intent-1",
        merchantReference: "EF-TEST",
        amount: 100,
        kind: "LABOR",
        returnUrl: "https://example.com/return",
        cancelUrl: "https://example.com/cancel",
      },
      { name: "Test User", email: "test@test.com" }
    );
    assert.strictEqual(checkout.type, "redirect");
    assert.ok(checkout.url);
    const fields = checkout.formFields || {};
    assert.strictEqual(fields.card_number, undefined);
    assert.strictEqual(fields.cvv, undefined);
    assert.strictEqual(fields.cvc, undefined);
    assert.ok(fields.amount);
    assert.ok(fields.m_payment_id);
  } finally {
    process.env.PAYFAST_MERCHANT_ID = prevId;
    process.env.PAYFAST_MERCHANT_KEY = prevKey;
    process.env.PAYFAST_MODE = prevMode;
  }
}

testRejectRawCredentials();
testRedaction();
testFingerprintDoesNotEmbedSecrets();
testPayfastCheckoutHasNoCardFields();
console.log("payments.cardSecurityBoundary.test.js: OK");
