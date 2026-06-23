/**
 * Lightweight payment module tests (no DB required for pure helpers).
 * Run: node tests/payments.intent.test.js
 */
const assert = require("assert");
const payfast = require("../src/services/payments/payfast.gateway");
const { normalizeProvider } = require("../src/services/payments/gatewayRegistry");
const { parsePaymentCardFromGatewayPayload } = require("../src/utils/paymentCard.util");

function testPayfastSignature() {
  const data = {
    merchant_id: "10000100",
    merchant_key: "46f0cd694581a",
    return_url: "http://www.yourdomain.co.za/return.php",
    cancel_url: "http://www.yourdomain.co.za/cancel.php",
    notify_url: "http://www.yourdomain.co.za/notify.php",
    name_first: "First Name",
    name_last: "Last Name",
    email_address: "test@test.com",
    m_payment_id: "1234",
    amount: "100.00",
    item_name: "Order#123",
  };
  const sig = payfast.buildSignature(data, "jt7NOE43FZPn");
  assert.strictEqual(typeof sig, "string");
  assert.strictEqual(sig.length, 32);
  // Hash for PayFast docs sample payload (document field order + passphrase).
  assert.strictEqual(sig, "1aa4b46a099e63fc9135c3dc602c8609");
}

function testNormalizeProvider() {
  assert.strictEqual(normalizeProvider("payfast"), "PAYFAST");
  assert.strictEqual(normalizeProvider("PAYJUSTNOW"), "PAYJUSTNOW");
  assert.strictEqual(normalizeProvider("invalid"), null);
}

function testParsePaymentCardFromGatewayPayload() {
  const sandbox = parsePaymentCardFromGatewayPayload(
    { source: "sandbox_return_url", intentId: "abc" },
    "PAYFAST"
  );
  assert.strictEqual(sandbox.last4, "4242");
  assert.strictEqual(sandbox.brand, "visa");

  const payfastItn = parsePaymentCardFromGatewayPayload(
    { card_last4: "2221", card_brand: "visa" },
    "PAYFAST"
  );
  assert.strictEqual(payfastItn.last4, "2221");

  const bnpl = parsePaymentCardFromGatewayPayload({ status: "approved" }, "PAYFLEX");
  assert.strictEqual(bnpl, null);

  const masked = parsePaymentCardFromGatewayPayload(
    { maskedPaymentMethod: "**** **** **** 3456" },
    "PAYFAST"
  );
  assert.strictEqual(masked.last4, "3456");
}

testPayfastSignature();
testNormalizeProvider();
testParsePaymentCardFromGatewayPayload();
console.log("payments.intent.test.js: OK");
