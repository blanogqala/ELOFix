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

  const crypto = require("crypto");
  const punctuationParam =
    "merchant_id=10000100&merchant_key=46f0cd694581a&return_url=http%3A%2F%2Fwww.yourdomain.co.za%2Freturn.php&cancel_url=http%3A%2F%2Fwww.yourdomain.co.za%2Fcancel.php&notify_url=http%3A%2F%2Fwww.yourdomain.co.za%2Fnotify.php&name_first=First+Name&name_last=Last+Name&email_address=test%40test.com&m_payment_id=1234&amount=100.00&item_name=Order%23123&passphrase=Test%21Salt+%281%29";
  assert.strictEqual(
    payfast.buildSignature(data, "Test!Salt (1)"),
    crypto.createHash("md5").update(punctuationParam, "utf8").digest("hex")
  );
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

function testPayfastPhpUrlEncodeVectors() {
  const { payfastUrlEncode } = require("../src/utils/payfastEncode.util");
  assert.strictEqual(payfastUrlEncode("a b"), "a+b");
  assert.strictEqual(payfastUrlEncode("+"), "%2B");
  assert.strictEqual(payfastUrlEncode("!"), "%21");
  assert.strictEqual(payfastUrlEncode("~"), "%7E");
  assert.strictEqual(payfastUrlEncode("*"), "%2A");
  assert.strictEqual(payfastUrlEncode("'"), "%27");
  assert.strictEqual(payfastUrlEncode("("), "%28");
  assert.strictEqual(payfastUrlEncode(")"), "%29");
  assert.strictEqual(payfastUrlEncode("&"), "%26");
  assert.strictEqual(payfastUrlEncode("="), "%3D");
  assert.strictEqual(payfastUrlEncode("%"), "%25");
  assert.strictEqual(payfastUrlEncode("é"), "%C3%A9");
  assert.strictEqual(payfastUrlEncode("Test!Salt (1)"), "Test%21Salt+%281%29");
}

function testItnSignatureFromDocumentedParamStrings() {
  const crypto = require("crypto");
  const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
  const ordered =
    "amount_gross=50.00&m_payment_id=EF-1&passphrase=elofix-test-salt";
  const punctuation =
    "m_payment_id=EF-1&amount_gross=100.00&passphrase=Test%21Salt+%281%29";
  assert.strictEqual(
    payfast.buildItnSignatureFromRaw(
      "amount_gross=50.00&m_payment_id=EF-1&signature=deadbeefdeadbeefdeadbeefdeadbeef",
      "elofix-test-salt"
    ),
    md5(ordered)
  );
  assert.strictEqual(
    payfast.buildItnSignatureFromRaw("m_payment_id=EF-1&amount_gross=100.00", "Test!Salt (1)"),
    md5(punctuation)
  );
  assert.notStrictEqual(
    payfast.buildItnSignatureFromRaw("amount_gross=50.00&m_payment_id=EF-1", "wrong-salt"),
    md5(ordered)
  );
  assert.notStrictEqual(
    payfast.buildItnSignatureFromRaw("amount_gross=99.00&m_payment_id=EF-1", "elofix-test-salt"),
    md5(ordered)
  );
  assert.notStrictEqual(
    payfast.buildItnSignatureFromRaw("amount_gross=50.00&m_payment_id=EF-2", "elofix-test-salt"),
    md5(ordered)
  );
  const reversed = payfast.buildItnSignatureFromRaw(
    "m_payment_id=EF-1&amount_gross=50.00",
    "elofix-test-salt"
  );
  assert.notStrictEqual(reversed, md5(ordered), "ITN field order must be preserved");

  const objectParam = "m_payment_id=EF-1&amount_gross=100.00&passphrase=elofix-test-salt";
  assert.strictEqual(
    payfast.buildItnSignature({ m_payment_id: "EF-1", amount_gross: "100.00" }, "elofix-test-salt"),
    md5(objectParam)
  );
  assert.strictEqual(
    payfast.buildItnSignature(
      { m_payment_id: "EF-1", amount_gross: "100.00", signature: "deadbeefdeadbeefdeadbeefdeadbeef" },
      "elofix-test-salt"
    ),
    md5(objectParam),
    "incoming signature field must be excluded"
  );
  const afterSignature = payfast.buildItnSignatureFromRaw(
    "m_payment_id=EF-1&signature=deadbeefdeadbeefdeadbeefdeadbeef&amount_gross=999.00",
    "elofix-test-salt"
  );
  assert.strictEqual(
    afterSignature,
    md5("m_payment_id=EF-1&passphrase=elofix-test-salt"),
    "reconstruction must stop at the signature field"
  );
}

async function testItnServerValidationPostsPfParamStringWithoutSecrets() {
  const crypto = require("crypto");
  const { payfastUrlEncode } = require("../src/utils/payfastEncode.util");
  const passphrase = "elofix-test-salt";
  const rawBody =
    "m_payment_id=EF-TEST-1&pf_payment_id=1234567&payment_status=COMPLETE&amount_gross=100.00&custom_str1=intent-1&name_last=&merchant_id=10000100&signature=deadbeefdeadbeefdeadbeefdeadbeef";
  const expectedPfParamString =
    "m_payment_id=EF-TEST-1&pf_payment_id=1234567&payment_status=COMPLETE&amount_gross=100.00&custom_str1=intent-1&name_last=&merchant_id=10000100";
  const expectedSignatureInput = `${expectedPfParamString}&passphrase=${payfastUrlEncode(passphrase)}`;

  assert.strictEqual(payfast.buildItnPfParamStringFromRaw(rawBody), expectedPfParamString);
  assert.ok(expectedPfParamString.includes("m_payment_id="));
  assert.ok(expectedPfParamString.includes("pf_payment_id="));
  assert.ok(expectedPfParamString.includes("payment_status="));
  assert.ok(expectedPfParamString.includes("amount_gross="));
  assert.ok(expectedPfParamString.includes("custom_str1="));
  assert.ok(expectedPfParamString.includes("name_last="));
  assert.ok(expectedPfParamString.includes("merchant_id="));
  assert.ok(!/(^|&)signature=/.test(expectedPfParamString));
  assert.ok(!/(^|&)passphrase=/.test(expectedPfParamString));
  assert.ok(
    expectedPfParamString.indexOf("m_payment_id=") <
      expectedPfParamString.indexOf("pf_payment_id=")
  );
  assert.ok(
    expectedPfParamString.indexOf("pf_payment_id=") <
      expectedPfParamString.indexOf("payment_status=")
  );
  assert.ok(
    expectedPfParamString.indexOf("payment_status=") <
      expectedPfParamString.indexOf("amount_gross=")
  );
  assert.ok(
    expectedPfParamString.indexOf("amount_gross=") <
      expectedPfParamString.indexOf("custom_str1=")
  );
  assert.ok(
    expectedPfParamString.indexOf("custom_str1=") < expectedPfParamString.indexOf("name_last=")
  );
  assert.ok(
    expectedPfParamString.indexOf("name_last=") < expectedPfParamString.indexOf("merchant_id=")
  );

  assert.strictEqual(
    payfast.buildItnSignatureFromRaw(rawBody, passphrase),
    crypto.createHash("md5").update(expectedSignatureInput, "utf8").digest("hex")
  );
  assert.ok(
    expectedSignatureInput.includes(`passphrase=${payfastUrlEncode(passphrase)}`),
    "local signature input must include the configured fake passphrase"
  );
  assert.notStrictEqual(
    payfast.buildItnSignatureFromRaw(rawBody, passphrase),
    crypto.createHash("md5").update(expectedPfParamString, "utf8").digest("hex"),
    "local signature MD5 must include the passphrase"
  );

  let capturedUrl = null;
  let capturedBody = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    capturedUrl = String(url);
    capturedBody = String(opts && opts.body != null ? opts.body : "");
    return { ok: true, status: 200, text: async () => "VALID" };
  };
  try {
    const parsed = {
      m_payment_id: "EF-TEST-1",
      pf_payment_id: "1234567",
      payment_status: "COMPLETE",
      amount_gross: "100.00",
      custom_str1: "intent-1",
      name_last: "",
      merchant_id: "10000100",
      signature: "deadbeefdeadbeefdeadbeefdeadbeef",
    };
    const valid = await payfast.validateItnServerSide(parsed, rawBody);
    assert.strictEqual(valid, true);
    assert.ok(String(capturedUrl).includes("/eng/query/validate"));
    assert.strictEqual(capturedBody, expectedPfParamString);
    assert.ok(!/(^|&)signature=/.test(capturedBody));
    assert.ok(!/(^|&)passphrase=/.test(capturedBody));
    assert.ok(capturedBody.includes("name_last="));
  } finally {
    global.fetch = originalFetch;
  }
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
testPayfastPhpUrlEncodeVectors();
testItnSignatureFromDocumentedParamStrings();
testItnSignatureRequiresConfiguredPassphrase();
testNormalizeProvider();
testParsePaymentCardFromGatewayPayload();
testHostedNotifyUrlFromPaymentBaseUrl();

testItnServerValidationPostsPfParamStringWithoutSecrets()
  .then(() => {
    console.log("payments.intent.test.js: OK");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
