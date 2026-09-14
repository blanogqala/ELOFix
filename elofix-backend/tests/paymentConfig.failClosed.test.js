/**
 * Production PayFast fail-closed configuration.
 * Run: node tests/paymentConfig.failClosed.test.js
 */
const assert = require("assert");
const {
  payfastSettleOnReturn,
  payfastSkipIpCheckAllowed,
  assertProductionPaymentSafety,
} = require("../src/services/payments/paymentConfig");

function run() {
  assert.strictEqual(
    payfastSettleOnReturn({ NODE_ENV: "production", PAYFAST_SETTLE_ON_RETURN: "true", PAYFAST_MODE: "sandbox" }),
    false
  );
  assert.strictEqual(
    payfastSkipIpCheckAllowed({ NODE_ENV: "production", PAYFAST_SKIP_IP_CHECK: "true" }),
    false
  );

  assert.throws(
    () =>
      assertProductionPaymentSafety({
        NODE_ENV: "production",
        PAYFAST_SKIP_IP_CHECK: "true",
      }),
    (err) => err.code === "UNSAFE_PAYFAST_PRODUCTION_CONFIG"
  );
  assert.throws(
    () =>
      assertProductionPaymentSafety({
        NODE_ENV: "production",
        PAYFAST_SETTLE_ON_RETURN: "true",
        PAYFAST_MODE: "sandbox",
      }),
    (err) => err.code === "UNSAFE_PAYFAST_PRODUCTION_CONFIG"
  );

  assert.doesNotThrow(() =>
    assertProductionPaymentSafety({ NODE_ENV: "production", PAYFAST_MODE: "sandbox" })
  );
  assert.doesNotThrow(() =>
    assertProductionPaymentSafety({
      NODE_ENV: "development",
      PAYFAST_SKIP_IP_CHECK: "true",
      PAYFAST_SETTLE_ON_RETURN: "true",
    })
  );

  assert.throws(
    () =>
      assertProductionPaymentSafety({
        NODE_ENV: "production",
        ENABLED_PAYMENT_PROVIDERS: "paystack",
        PAYSTACK_MODE: "live",
        PAYSTACK_SECRET_KEY: "sk_test_must_fail_closed",
      }),
    (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH"
  );
  assert.throws(
    () =>
      assertProductionPaymentSafety({
        NODE_ENV: "production",
        ENABLED_PAYMENT_PROVIDERS: "paystack",
        PAYSTACK_MODE: "test",
        PAYSTACK_SECRET_KEY: "sk_live_must_fail_closed",
      }),
    (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH"
  );
  assert.doesNotThrow(() =>
    assertProductionPaymentSafety({
      NODE_ENV: "production",
      ENABLED_PAYMENT_PROVIDERS: "payfast",
      PAYSTACK_MODE: "live",
      PAYSTACK_SECRET_KEY: "sk_test_ignored_when_disabled",
      PAYFAST_MODE: "sandbox",
    })
  );
  assert.doesNotThrow(() =>
    assertProductionPaymentSafety({
      NODE_ENV: "production",
      ENABLED_PAYMENT_PROVIDERS: "paystack",
      PAYSTACK_MODE: "test",
      PAYSTACK_SECRET_KEY: "sk_test_ok",
      PAYSTACK_PUBLIC_KEY: "pk_test_ok",
    })
  );

  assert.strictEqual(
    payfastSettleOnReturn({ NODE_ENV: "development", PAYFAST_MODE: "sandbox" }),
    true
  );
  assert.strictEqual(
    payfastSkipIpCheckAllowed({ NODE_ENV: "development", PAYFAST_SKIP_IP_CHECK: "true" }),
    true
  );

  console.log("paymentConfig.failClosed.test.js: all passed");
}

run();
