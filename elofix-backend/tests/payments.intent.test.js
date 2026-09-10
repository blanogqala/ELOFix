/**
 * Lightweight payment module tests (no DB required for pure helpers).
 * Run: node tests/payments.intent.test.js
 */
const assert = require("assert");
const payfast = require("../src/services/payments/payfast.gateway");
const { normalizeProvider } = require("../src/services/payments/gatewayRegistry");
const { parsePaymentCardFromGatewayPayload } = require("../src/utils/paymentCard.util");

function withPayfastEnv(overrides, fn) {
  const keys = [
    "PAYFAST_MERCHANT_ID",
    "PAYFAST_MERCHANT_KEY",
    "PAYFAST_PASSPHRASE",
    "PAYFAST_MODE",
    "PAYFAST_NOTIFY_URL",
    "PAYMENT_BASE_URL",
    "FRONTEND_BASE_URL",
  ];
  const prev = {};
  for (const key of keys) prev[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function testGatewayHasNoSharedSandboxWorkaround() {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../src/services/payments/payfast.gateway.js"), "utf8");
  assert.ok(!/10000100/.test(src), "gateway must not special-case merchant 10000100");
  assert.ok(!/jt7NOE43FZPn/.test(src), "gateway must not hard-code a passphrase");
  assert.ok(!/isSharedSandboxMerchant/.test(src));
  assert.ok(!/obsoleteDocsPassphrase/.test(src));
}

function testPayfastDocsSampleSignature() {
  // Published PayFast Custom Integration sample payload + documented MD5.
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
  assert.strictEqual(sig, "1aa4b46a099e63fc9135c3dc602c8609");
}

function testSandboxCheckoutIncludesSignatureForAnyMerchant() {
  const passphrase = "elofix-test-salt";
  withPayfastEnv(
    {
      PAYFAST_MERCHANT_ID: "10000100",
      PAYFAST_MERCHANT_KEY: "46f0cd694581a",
      PAYFAST_PASSPHRASE: passphrase,
      PAYFAST_MODE: "sandbox",
      PAYMENT_BASE_URL: "https://elofix-6136.onrender.com",
      FRONTEND_BASE_URL: "https://elofix.co.za",
      PAYFAST_NOTIFY_URL: undefined,
    },
    () => {
      const checkout = payfast.createCheckout(
        {
          id: "intent-1",
          merchantReference: "EF-TEST",
          amount: 100,
          kind: "LABOR",
          jobId: "job-1",
          returnUrl: "https://elofix.co.za/payments/return?intentId=intent-1",
          cancelUrl: "https://elofix.co.za/payments/cancel?intentId=intent-1",
        },
        { name: "Test User", email: "test@test.com" }
      );
      const fields = checkout.formFields;
      assert.strictEqual(fields.merchant_id, "10000100");
      assert.ok(fields.merchant_key);
      assert.strictEqual(fields.notify_url, "https://elofix-6136.onrender.com/api/payments/webhooks/payfast");
      assert.ok(String(fields.return_url).includes("/payments/return"));
      assert.ok(String(fields.cancel_url).includes("/payments/cancel"));
      assert.strictEqual(fields.m_payment_id, "EF-TEST");
      assert.strictEqual(fields.amount, "100.00");
      assert.ok(fields.item_name);
      assert.strictEqual(fields.custom_str1, "intent-1");
      assert.strictEqual(fields.custom_str2, "LABOR");
      assert.strictEqual(fields.custom_str3, "job-1");
      assert.strictEqual(typeof fields.signature, "string");
      assert.strictEqual(fields.signature.length, 32);
      const unsigned = { ...fields };
      delete unsigned.signature;
      const expected = payfast.buildSignature(unsigned, passphrase);
      assert.strictEqual(fields.signature, expected);

      const otherPass = payfast.buildSignature(unsigned, "different-salt");
      assert.notStrictEqual(fields.signature, otherPass);
    }
  );
}

function testCheckoutAmountComesFromIntent() {
  const { splitFiftyFiftySchedule } = require("../src/services/payments/money.util");
  const schedule = splitFiftyFiftySchedule(200);
  assert.strictEqual(Number(schedule.firstPaymentAmount), 100);
  assert.strictEqual(Number(schedule.secondPaymentAmount), 100);

  withPayfastEnv(
    {
      PAYFAST_MERCHANT_ID: "sandbox-merchant",
      PAYFAST_MERCHANT_KEY: "sandbox-key",
      PAYFAST_PASSPHRASE: "elofix-test-salt",
      PAYFAST_MODE: "sandbox",
      PAYMENT_BASE_URL: "https://elofix-6136.onrender.com",
    },
    () => {
      const deposit = payfast.createCheckout(
        {
          id: "deposit-1",
          merchantReference: "EF-DEP",
          amount: Number(schedule.firstPaymentAmount),
          kind: "LABOR",
        },
        { name: "Customer", email: "c@example.com", amount: 999 }
      );
      assert.strictEqual(deposit.formFields.amount, "100.00");
      const completion = payfast.createCheckout(
        {
          id: "completion-1",
          merchantReference: "EF-COM",
          amount: Number(schedule.secondPaymentAmount),
          kind: "LABOR",
        },
        { name: "Customer", email: "c@example.com", amount: 1 }
      );
      assert.strictEqual(completion.formFields.amount, "100.00");
    }
  );
}

function testItnSignatureRequiresConfiguredPassphrase() {
  const payload = {
    m_payment_id: "EF-ITN-1",
    payment_status: "COMPLETE",
    amount_gross: "100.00",
  };
  const correct = payfast.buildItnSignature(payload, "elofix-test-salt");
  const wrong = payfast.buildItnSignature(payload, "wrong-salt");
  assert.strictEqual(correct.length, 32);
  assert.notStrictEqual(correct, wrong);
  assert.strictEqual(payfast.buildItnSignature(payload, "elofix-test-salt"), correct);
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

testGatewayHasNoSharedSandboxWorkaround();
testPayfastDocsSampleSignature();
testSandboxCheckoutIncludesSignatureForAnyMerchant();
testCheckoutAmountComesFromIntent();
testItnSignatureRequiresConfiguredPassphrase();
testNormalizeProvider();
testParsePaymentCardFromGatewayPayload();
testHostedNotifyUrlFromPaymentBaseUrl();
console.log("payments.intent.test.js: OK");
