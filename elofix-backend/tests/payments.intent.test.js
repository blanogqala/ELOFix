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

  // Shared sandbox merchant: omit signature even if obsolete docs passphrase is set.
  const prevId = process.env.PAYFAST_MERCHANT_ID;
  const prevKey = process.env.PAYFAST_MERCHANT_KEY;
  const prevPass = process.env.PAYFAST_PASSPHRASE;
  const prevMode = process.env.PAYFAST_MODE;
  process.env.PAYFAST_MERCHANT_ID = "10000100";
  process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
  process.env.PAYFAST_PASSPHRASE = "jt7NOE43FZPn";
  process.env.PAYFAST_MODE = "sandbox";
  try {
    const checkout = payfast.createCheckout(
      {
        id: "intent-1",
        merchantReference: "EF-TEST",
        amount: 100,
        kind: "SERVICE",
        returnUrl: "http://www.yourdomain.co.za/return.php",
        cancelUrl: "http://www.yourdomain.co.za/cancel.php",
      },
      { name: "Test User", email: "test@test.com" }
    );
    assert.strictEqual(checkout.formFields.signature, undefined);
  } finally {
    process.env.PAYFAST_MERCHANT_ID = prevId;
    process.env.PAYFAST_MERCHANT_KEY = prevKey;
    process.env.PAYFAST_PASSPHRASE = prevPass;
    process.env.PAYFAST_MODE = prevMode;
  }
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

function testHostedNotifyUrlFromPaymentBaseUrl() {
  const prevBase = process.env.PAYMENT_BASE_URL;
  const prevNotify = process.env.PAYFAST_NOTIFY_URL;
  const prevFront = process.env.FRONTEND_BASE_URL;
  process.env.PAYMENT_BASE_URL = "https://elofix-6136.onrender.com";
  delete process.env.PAYFAST_NOTIFY_URL;
  process.env.FRONTEND_BASE_URL = "https://elofix.co.za";
  try {
    const checkout = payfast.createCheckout(
      {
        id: "intent-hosted",
        merchantReference: "EF-HOSTED",
        amount: 100,
        kind: "LABOR",
      },
      { name: "Customer", email: "customer@example.com" }
    );
    assert.strictEqual(
      checkout.formFields.notify_url,
      "https://elofix-6136.onrender.com/api/payments/webhooks/payfast"
    );
    assert.ok(checkout.formFields.return_url.startsWith("https://elofix.co.za/payments/return"));
    assert.ok(checkout.formFields.cancel_url.startsWith("https://elofix.co.za/payments/cancel"));
  } finally {
    if (prevBase === undefined) delete process.env.PAYMENT_BASE_URL;
    else process.env.PAYMENT_BASE_URL = prevBase;
    if (prevNotify === undefined) delete process.env.PAYFAST_NOTIFY_URL;
    else process.env.PAYFAST_NOTIFY_URL = prevNotify;
    if (prevFront === undefined) delete process.env.FRONTEND_BASE_URL;
    else process.env.FRONTEND_BASE_URL = prevFront;
  }
}

testPayfastSignature();
testNormalizeProvider();
testParsePaymentCardFromGatewayPayload();
testHostedNotifyUrlFromPaymentBaseUrl();
console.log("payments.intent.test.js: OK");
