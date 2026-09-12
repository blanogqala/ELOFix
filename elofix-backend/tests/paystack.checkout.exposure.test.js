/**
 * Phase D2 Block 3 — Paystack hosted checkout kinds + fail-closed recipient.
 * Run: node tests/paystack.checkout.exposure.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const assert = require("assert");
const paystack = require("../src/services/payments/paystack.gateway");
const recipient = require("../src/services/payments/paystack.recipient");
const {
  buildCheckoutInitializePayload,
  assertInitializeSplitPayload,
  assertInitializeRepaymentPayload,
} = require("../src/services/payments/paystack.payload");
const AppError = require("../src/utils/AppError");

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const key of keys) prev[key] = process.env[key];
  const restore = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
  };
}

function installFetchMock(router) {
  const calls = [];
  const previous = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || "GET").toUpperCase();
    let parsed = null;
    if (opts.body) {
      parsed = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
    }
    calls.push({ url: u, method, body: parsed });
    if (typeof router === "function") {
      return router(u, method, parsed, opts, calls);
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  return {
    calls,
    restore() {
      global.fetch = previous;
    },
  };
}

function validTestEnv() {
  return {
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
    PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
    ENABLED_PAYMENT_PROVIDERS: "paystack",
  };
}

async function checkoutKind(kind, extras = {}) {
  const originalLookup = recipient.lookupMarketplaceSubaccount;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/transaction/initialize") && method === "POST") {
      return jsonResponse({
        status: true,
        data: {
          authorization_url: `https://checkout.paystack.com/${kind.toLowerCase()}`,
          access_code: "access_mock",
          reference: extras.merchantReference || "EF-REF12345678901234",
        },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  recipient.lookupMarketplaceSubaccount = async () => extras.subaccount || "ACCT_TESTCODE";
  try {
    return await withEnv(validTestEnv(), async () => {
      const result = await paystack.createCheckout(
        {
          id: `intent-${kind}`,
          merchantReference: extras.merchantReference || "EF-REF12345678901234",
          kind,
          amount: extras.amount || 100,
          currency: "ZAR",
          jobId: extras.jobId || "job-1",
          materialOrderId: extras.materialOrderId,
        },
        { email: "customer@example.test" }
      );
      assert.strictEqual(result.type, "redirect");
      assert.ok(String(result.url).startsWith("https://checkout.paystack.com/"));
      assert.strictEqual(result.method, "GET");
      const body = fetchMock.calls[0].body;
      return { result, body, calls: fetchMock.calls };
    });
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
    fetchMock.restore();
  }
}

function assertSplitBody(body, subaccount) {
  assert.strictEqual(body.subaccount, subaccount);
  assert.strictEqual(body.bearer, "subaccount");
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "transaction_charge"));
  assert.ok(!Object.prototype.hasOwnProperty.call(body, "percentage_charge"));
  assertInitializeSplitPayload(body);
}

async function testLaborSplitCheckout() {
  const { body } = await checkoutKind("LABOR", { amount: 100, subaccount: "ACCT_LABOR" });
  assert.strictEqual(body.amount, 10000);
  assertSplitBody(body, "ACCT_LABOR");
}

async function testMaterialOrderSplitCheckout() {
  const { body } = await checkoutKind("MATERIAL_ORDER", {
    amount: 200,
    materialOrderId: "mo-1",
    subaccount: "ACCT_BRANCH",
  });
  assert.strictEqual(body.amount, 20000);
  assertSplitBody(body, "ACCT_BRANCH");
}

async function testJobStoreOrderSplitCheckout() {
  const { body } = await checkoutKind("JOB_STORE_ORDER", {
    amount: 80,
    jobId: "job-store",
    subaccount: "ACCT_STORE",
  });
  assert.strictEqual(body.amount, 8000);
  assertSplitBody(body, "ACCT_STORE");
}

async function testDeliveryFeeSplitCheckout() {
  const { body } = await checkoutKind("DELIVERY_FEE", {
    amount: 50,
    subaccount: "ACCT_COURIER",
  });
  assert.strictEqual(body.amount, 5000);
  assertSplitBody(body, "ACCT_COURIER");
}

async function testMissingRecipientDoesNotInitialize() {
  const originalLookup = recipient.lookupMarketplaceSubaccount;
  const fetchMock = installFetchMock(() => {
    throw new Error("Paystack initialize must not be called without a recipient");
  });
  recipient.lookupMarketplaceSubaccount = async () => {
    const err = new Error("Paystack recipient is not configured");
    err.code = "PAYSTACK_RECIPIENT_REQUIRED";
    throw err;
  };
  try {
    await withEnv(validTestEnv(), async () => {
      await assert.rejects(
        () =>
          paystack.createCheckout(
            {
              id: "intent-missing",
              merchantReference: "EF-REFMISSING0000001",
              kind: "LABOR",
              amount: 100,
              currency: "ZAR",
              jobId: "job-1",
            },
            { email: "customer@example.test" }
          ),
        (err) =>
          (err instanceof AppError || err.code === "PAYSTACK_RECIPIENT_REQUIRED") &&
          err.code === "PAYSTACK_RECIPIENT_REQUIRED"
      );
      assert.strictEqual(fetchMock.calls.length, 0);
    });
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
    fetchMock.restore();
  }
}

async function testRepaymentHasNoSplitFields() {
  const originalLookup = recipient.lookupMarketplaceSubaccount;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/transaction/initialize") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { authorization_url: "https://checkout.paystack.com/repay", access_code: "acs" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  recipient.lookupMarketplaceSubaccount = async () => "ACCT_MUST_BE_IGNORED";
  try {
    await withEnv(validTestEnv(), async () => {
      await paystack.createCheckout(
        {
          id: "repay-1",
          merchantReference: "EFX-RR-ABCDEF1234567890",
          kind: "PROVIDER_REFUND_REPAYMENT",
          amount: 93,
          currency: "ZAR",
          jobId: "job-1",
        },
        { email: "provider@example.test" }
      );
      const body = fetchMock.calls[0].body;
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "subaccount"));
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "bearer"));
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "percentage_charge"));
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "transaction_charge"));
      assertInitializeRepaymentPayload(body);
    });
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
    fetchMock.restore();
  }
}

function testPayloadKindsMatchAccounting() {
  const labor = buildCheckoutInitializePayload(
    { id: "1", merchantReference: "EF-MERCHANTREF1234567", kind: "LABOR", amount: 100, currency: "ZAR" },
    { email: "c@example.test" },
    { subaccountCode: "ACCT_X" }
  );
  assert.strictEqual(labor.amount, 10000);
  assert.strictEqual(labor.subaccount, "ACCT_X");
  assert.strictEqual(labor.bearer, "subaccount");
}

async function main() {
  testPayloadKindsMatchAccounting();
  await testLaborSplitCheckout();
  await testMaterialOrderSplitCheckout();
  await testJobStoreOrderSplitCheckout();
  await testDeliveryFeeSplitCheckout();
  await testMissingRecipientDoesNotInitialize();
  await testRepaymentHasNoSplitFields();
  console.log("paystack.checkout.exposure.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
