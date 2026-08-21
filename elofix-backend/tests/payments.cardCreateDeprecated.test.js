/**
 * Card create deprecation contract (no DB / no controller import).
 * Run: node tests/payments.cardCreateDeprecated.test.js
 *
 * Production controller returns 410 CARD_ENTRY_MOVED_TO_PAYMENT_PROVIDER
 * before any sensitive body fields are processed (see payment.controller.js).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function testControllerSourceRejectsBeforeVault() {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/controllers/payment.controller.js"),
    "utf8"
  );
  assert.ok(src.includes("CARD_ENTRY_MOVED_TO_PAYMENT_PROVIDER"));
  assert.ok(src.includes("410"));
  // Must not call paymentService.addCard anymore
  assert.ok(!/paymentService\.addCard\s*\(/.test(src));
  // createPaymentIntent must reject raw credentials
  assert.ok(src.includes("findRejectedCardCredentialKey"));
  assert.ok(src.includes("CARD_DATA_NOT_ACCEPTED") || src.includes("CARD_ENTRY_MOVED_TO_PAYMENT_PROVIDER"));
}

testControllerSourceRejectsBeforeVault();
console.log("payments.cardCreateDeprecated.test.js: OK");
