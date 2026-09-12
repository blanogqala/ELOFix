/**
 * Phase D2 Block 3 — GET /payments/providers fail-closed Paystack exposure.
 * Run: node tests/paystack.providers.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { listEnabledGateways } = require("../src/services/payments/gatewayRegistry");
const { enabledProviders } = require("../src/services/payments/paymentConfig");
const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const paymentController = require("../src/controllers/payment.controller");

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

function validTestEnv() {
  return {
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
    PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
  };
}

async function invokeListProviders() {
  return new Promise((resolve, reject) => {
    const res = {
      json(body) {
        resolve(body);
      },
      status() {
        return this;
      },
    };
    Promise.resolve(paymentController.listPaymentProviders({}, res)).catch(reject);
  });
}

function testDefaultEnabledListDoesNotIncludePaystack() {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/services/payments/paymentConfig.js"),
    "utf8"
  );
  assert.match(src, /ENABLED_PAYMENT_PROVIDERS \|\| "payfast,payflex,payjustnow"/);
  assert.doesNotMatch(src, /ENABLED_PAYMENT_PROVIDERS \|\| "[^"]*paystack/);
  withEnv({ ENABLED_PAYMENT_PROVIDERS: undefined }, () => {
    const enabled = enabledProviders();
    assert.ok(enabled.has("payfast"));
    assert.ok(!enabled.has("paystack"));
  });
}

async function testPaystackAbsentWhenNotEnabled() {
  await withEnv(
    {
      ...validTestEnv(),
      ENABLED_PAYMENT_PROVIDERS: "payfast,payflex,payjustnow",
    },
    async () => {
      const list = listEnabledGateways();
      assert.ok(!list.includes("PAYSTACK"));
      const providers = await paymentIntentService.listProviders();
      assert.ok(!providers.includes("PAYSTACK"));
      const body = await invokeListProviders();
      assert.strictEqual(body.success, true);
      assert.ok(!body.providers.includes("PAYSTACK"));
    }
  );
}

async function testPaystackPresentWhenEnabledAndValidTestConfig() {
  await withEnv(
    {
      ...validTestEnv(),
      ENABLED_PAYMENT_PROVIDERS: "paystack",
    },
    async () => {
      const list = listEnabledGateways();
      assert.ok(list.includes("PAYSTACK"));
      const providers = await paymentIntentService.listProviders();
      assert.ok(providers.includes("PAYSTACK"));
      const body = await invokeListProviders();
      assert.strictEqual(body.success, true);
      assert.ok(body.providers.includes("PAYSTACK"));
    }
  );
}

async function testPaystackAbsentWhenCredentialsMissing() {
  await withEnv(
    {
      PAYSTACK_MODE: "test",
      PAYSTACK_SECRET_KEY: undefined,
      PAYSTACK_PUBLIC_KEY: undefined,
      ENABLED_PAYMENT_PROVIDERS: "paystack",
    },
    async () => {
      const list = listEnabledGateways();
      assert.ok(!list.includes("PAYSTACK"));
      const body = await invokeListProviders();
      assert.ok(!body.providers.includes("PAYSTACK"));
    }
  );
}

async function testTestModeRejectsLiveKey() {
  await withEnv(
    {
      PAYSTACK_MODE: "test",
      PAYSTACK_SECRET_KEY: "sk_live_must_fail_closed",
      ENABLED_PAYMENT_PROVIDERS: "paystack",
    },
    async () => {
      const list = listEnabledGateways();
      assert.ok(!list.includes("PAYSTACK"));
      const body = await invokeListProviders();
      assert.ok(!body.providers.includes("PAYSTACK"));
    }
  );
}

async function testLiveModeRejectsTestKey() {
  await withEnv(
    {
      PAYSTACK_MODE: "live",
      PAYSTACK_SECRET_KEY: "sk_test_must_fail_closed",
      ENABLED_PAYMENT_PROVIDERS: "paystack",
    },
    async () => {
      const list = listEnabledGateways();
      assert.ok(!list.includes("PAYSTACK"));
      const body = await invokeListProviders();
      assert.ok(!body.providers.includes("PAYSTACK"));
    }
  );
}

async function main() {
  testDefaultEnabledListDoesNotIncludePaystack();
  await testPaystackAbsentWhenNotEnabled();
  await testPaystackPresentWhenEnabledAndValidTestConfig();
  await testPaystackAbsentWhenCredentialsMissing();
  await testTestModeRejectsLiveKey();
  await testLiveModeRejectsTestKey();
  console.log("paystack.providers.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");
runTestMain(main);
