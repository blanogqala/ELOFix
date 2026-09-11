/**
 * D1.5 Paystack Model A feasibility — request construction only (no HTTP).
 * Run: node tests/paystackD15.feasibility.test.js
 */
const assert = require("assert");
const {
  ELOFIX_GROSS_COMMISSION_PERCENT,
  uniqueD15Reference,
  buildCreateSubaccountPayload,
  buildInitializeSplitPayload,
  buildCreateRefundPayload,
  assertInitializeSplitPayload,
  toCents,
} = require("../scripts/paystack-d15/payload");
const {
  LIVE_KEY_MESSAGE,
  secretKeyPrefix,
  assertPaystackTestMode,
  assertDedicatedTestBankEnv,
} = require("../scripts/paystack-d15/client");
const { maskAccountNumber } = require("../scripts/paystack-d15/redact");
const {
  PRIMARY_SA_BANKS_PATH,
  FALLBACK_SA_BANKS_PATH,
  isSouthAfricaZarBank,
  selectSouthAfricaZarBanks,
} = require("../scripts/paystack-d15/banks");

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
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

function testCentsConversion() {
  assert.strictEqual(toCents(100), 10000);
  assert.strictEqual(toCents("150.00"), 15000);
  assert.strictEqual(toCents(1), 100);
}

function testSubaccountPayload() {
  const payload = buildCreateSubaccountPayload({
    businessName: "EloFix D15 Test",
    bankCode: "632005",
    accountNumber: "0000000000",
  });
  assert.strictEqual(payload.percentage_charge, 7);
  assert.strictEqual(payload.percentage_charge, ELOFIX_GROSS_COMMISSION_PERCENT);
  assert.strictEqual(payload.business_name, "EloFix D15 Test");
  assert.strictEqual(payload.settlement_bank, "632005");
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "transaction_charge"));
}

function testInitializeSplitPayload() {
  const a = buildInitializeSplitPayload({
    email: "d15@example.test",
    amountMajor: 100,
    subaccountCode: "ACCT_TESTCODE",
  });
  const b = buildInitializeSplitPayload({
    email: "d15@example.test",
    amountMajor: 100,
    subaccountCode: "ACCT_TESTCODE",
  });
  assert.strictEqual(a.amount, 10000);
  assert.strictEqual(a.currency, "ZAR");
  assert.strictEqual(a.bearer, "subaccount");
  assert.strictEqual(a.subaccount, "ACCT_TESTCODE");
  assert.strictEqual(a.email, "d15@example.test");
  assert.ok(!Object.prototype.hasOwnProperty.call(a, "transaction_charge"));
  assert.notStrictEqual(a.reference, b.reference);
  assert.ok(/^D15-\d+-[A-Z0-9]+$/.test(a.reference));
  assertInitializeSplitPayload(a);

  const withRef = buildInitializeSplitPayload({
    email: "d15@example.test",
    amountMajor: 100,
    subaccountCode: "ACCT_TESTCODE",
    reference: "D15-FIXED-REF",
  });
  assert.strictEqual(withRef.reference, "D15-FIXED-REF");
}

function testRefundPayload() {
  const full = buildCreateRefundPayload({ transaction: "D15-ABC" });
  assert.strictEqual(full.transaction, "D15-ABC");
  assert.strictEqual(full.currency, "ZAR");
  assert.ok(!Object.prototype.hasOwnProperty.call(full, "amount"));

  const partial = buildCreateRefundPayload({ transaction: "D15-ABC", amountMajor: 40 });
  assert.strictEqual(partial.amount, 4000);
}

function testRejectTransactionCharge() {
  assert.throws(
    () =>
      assertInitializeSplitPayload({
        email: "a@b.c",
        amount: 10000,
        currency: "ZAR",
        reference: "D15-X",
        subaccount: "ACCT_X",
        bearer: "subaccount",
        transaction_charge: 700,
      }),
    /transaction_charge/
  );
  assert.throws(
    () =>
      assertInitializeSplitPayload({
        email: "a@b.c",
        amount: 10000,
        currency: "ZAR",
        reference: "D15-X",
        subaccount: "ACCT_X",
        bearer: "account",
      }),
    /bearer/
  );
}

function testLiveKeyRefusal() {
  assert.strictEqual(secretKeyPrefix("sk_live_example"), "sk_live_");
  assert.strictEqual(secretKeyPrefix("sk_test_example"), "sk_test_");
  withEnv({ PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_live_FORBIDDEN" }, () => {
    assert.throws(() => assertPaystackTestMode(), (err) => {
      assert.strictEqual(err.code, "D15_REFUSED_LIVE_KEY");
      assert.strictEqual(err.message, LIVE_KEY_MESSAGE);
      return true;
    });
  });
  withEnv({ PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_test_ok" }, () => {
    assert.throws(() => assertPaystackTestMode(), (err) => err.code === "D15_MODE_NOT_TEST");
  });
  withEnv({ PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_ok" }, () => {
    const out = assertPaystackTestMode();
    assert.strictEqual(out.mode, "test");
    assert.strictEqual(out.keyPrefix, "sk_test_");
    assert.ok(!Object.prototype.hasOwnProperty.call(out, "secret"));
  });
  withEnv({ NODE_ENV: "production", PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_ok" }, () => {
    const out = assertPaystackTestMode();
    assert.strictEqual(out.mode, "test");
  });
}

function testDedicatedBankEnv() {
  withEnv(
    {
      PAYSTACK_D15_TEST_EMAIL: "",
      PAYSTACK_D15_TEST_BUSINESS_NAME: "",
      PAYSTACK_D15_TEST_BANK_NAME: "",
      PAYSTACK_D15_TEST_ACCOUNT_NUMBER: "",
    },
    () => {
      assert.throws(() => assertDedicatedTestBankEnv(), (err) => err.code === "D15_TEST_BANK_MISSING");
    }
  );
}

function testMasking() {
  assert.strictEqual(maskAccountNumber("1234567890"), "******7890");
  const ref = uniqueD15Reference();
  assert.ok(ref.startsWith("D15-"));
}

function testSaBankListQuery() {
  assert.strictEqual(PRIMARY_SA_BANKS_PATH, "/bank?currency=ZAR&enabled_for_verification=true");
  assert.strictEqual(FALLBACK_SA_BANKS_PATH, "/bank?country=south%20africa");
  assert.ok(!PRIMARY_SA_BANKS_PATH.includes("south_africa"));
  assert.ok(!FALLBACK_SA_BANKS_PATH.includes("south_africa"));

  assert.strictEqual(
    isSouthAfricaZarBank({ name: "ABSA", code: "632005", currency: "ZAR", country: "South Africa" }),
    true
  );
  assert.strictEqual(isSouthAfricaZarBank({ name: "ABSA", code: "632005", currency: "ZAR" }), true);
  assert.strictEqual(
    isSouthAfricaZarBank({ name: "GTBank", code: "058", currency: "NGN", country: "Nigeria" }),
    false
  );
  assert.strictEqual(
    isSouthAfricaZarBank({ name: "X", code: "1", currency: "ZAR", country: "Nigeria" }),
    false
  );

  const selected = selectSouthAfricaZarBanks([
    {
      name: "ABSA Bank",
      code: "632005",
      currency: "ZAR",
      country: "South Africa",
      type: "nuban",
      active: true,
    },
    { name: "Foreign", code: "999", currency: "USD", country: "United States" },
    { name: "FNB", code: "250655", currency: "ZAR" },
  ]);
  assert.strictEqual(selected.length, 2);
  assert.deepStrictEqual(Object.keys(selected[0]).sort(), [
    "active",
    "code",
    "country",
    "currency",
    "name",
    "supported_types",
    "type",
  ]);
}

function run() {
  testCentsConversion();
  testSubaccountPayload();
  testInitializeSplitPayload();
  testRefundPayload();
  testRejectTransactionCharge();
  testLiveKeyRefusal();
  testDedicatedBankEnv();
  testMasking();
  testSaBankListQuery();
  console.log("paystackD15.feasibility.test.js: all passed");
}

run();
