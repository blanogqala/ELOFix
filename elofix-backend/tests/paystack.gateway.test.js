/**
 * Phase D2 Block 1 — Paystack adapter foundation (no live HTTP).
 * Run: node tests/paystack.gateway.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const crypto = require("crypto");
const {
  normalizeProvider,
  listEnabledGateways,
  getGateway,
} = require("../src/services/payments/gatewayRegistry");
const {
  assertPaystackCredentials,
  isPaystackConfigured,
  paystackSecretKeyPrefix,
  settlementCapableGateway,
} = require("../src/services/payments/paymentConfig");
const { splitCommission } = require("../src/services/payments/money.util");
const paystack = require("../src/services/payments/paystack.gateway");
const recipient = require("../src/services/payments/paystack.recipient");
const {
  buildCheckoutInitializePayload,
  buildCreateSubaccountPayload,
  assertInitializeSplitPayload,
  assertInitializeRepaymentPayload,
  mapPaystackRefundResult,
  alreadySplitSettlementResult,
  toCents,
} = require("../src/services/payments/paystack.payload");
const {
  resolvePaystackBankCode,
  normalizeBankName,
} = require("../src/services/payments/paystack.banks");
const { normalizeGatewayRefundResult } = require("../src/services/payments/refund.service");
const { classifyGatewayRefundResult } = require("../src/utils/refundMath.util");

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
    calls.push({
      url: u,
      method,
      body: parsed,
      hasAuthorization: Boolean(opts.headers && opts.headers.Authorization),
    });
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
  };
}

function testNormalizeProvider() {
  assert.strictEqual(normalizeProvider("PAYSTACK"), "PAYSTACK");
  assert.strictEqual(normalizeProvider("paystack"), "PAYSTACK");
  assert.strictEqual(normalizeProvider("Pay-Stack"), "PAYSTACK");
  assert.strictEqual(normalizeProvider("payfast"), "PAYFAST");
  assert.strictEqual(normalizeProvider("invalid"), null);
}

function testEnabledRegistry() {
  withEnv(
    {
      ...validTestEnv(),
      ENABLED_PAYMENT_PROVIDERS: "payfast,payflex,payjustnow",
    },
    () => {
      const list = listEnabledGateways();
      assert.ok(!list.includes("PAYSTACK"), "Paystack must stay opt-in");
    }
  );

  withEnv(
    {
      ...validTestEnv(),
      ENABLED_PAYMENT_PROVIDERS: "paystack",
    },
    () => {
      const list = listEnabledGateways();
      assert.ok(list.includes("PAYSTACK"));
      const gw = getGateway("PAYSTACK");
      assert.strictEqual(gw.name, "PAYSTACK");
    }
  );

  withEnv(
    {
      PAYSTACK_MODE: "test",
      PAYSTACK_SECRET_KEY: "sk_live_should_not_work",
      ENABLED_PAYMENT_PROVIDERS: "paystack",
    },
    () => {
      assert.strictEqual(isPaystackConfigured(), false);
      const list = listEnabledGateways();
      assert.ok(!list.includes("PAYSTACK"));
    }
  );
}

function testFailClosedKeys() {
  assert.strictEqual(paystackSecretKeyPrefix("sk_test_abc"), "sk_test_");
  assert.strictEqual(paystackSecretKeyPrefix("sk_live_abc"), "sk_live_");

  withEnv({ PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_live_FORBIDDEN" }, () => {
    assert.strictEqual(isPaystackConfigured(), false);
    assert.throws(() => assertPaystackCredentials(), (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH");
  });

  withEnv({ PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_test_ok" }, () => {
    assert.strictEqual(isPaystackConfigured(), false);
    assert.throws(() => assertPaystackCredentials(), (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH");
  });

  withEnv({ NODE_ENV: "production", PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_ok" }, () => {
    const out = assertPaystackCredentials();
    assert.strictEqual(out.mode, "test");
    assert.strictEqual(out.keyPrefix, "sk_test_");
    assert.ok(!Object.prototype.hasOwnProperty.call(out, "secret"));
  });

  withEnv({ PAYSTACK_MODE: "sandbox", PAYSTACK_SECRET_KEY: "sk_test_ok" }, () => {
    assert.throws(() => assertPaystackCredentials(), (err) => err.code === "PAYSTACK_MODE_INVALID");
  });

  withEnv(
    {
      PAYSTACK_MODE: "test",
      PAYSTACK_SECRET_KEY: "sk_test_ok",
      PAYSTACK_PUBLIC_KEY: "pk_live_mismatch",
    },
    () => {
      assert.throws(() => assertPaystackCredentials(), (err) => err.code === "PAYSTACK_PUBLIC_KEY_MODE_MISMATCH");
    }
  );
}

function testCheckoutPayloadSplitAndRepayment() {
  const laborIntent = {
    id: "intent-1",
    merchantReference: "EF-MERCHANTREF1234567",
    kind: "LABOR",
    amount: 100,
    currency: "ZAR",
    jobId: "job-1",
  };
  const customer = { email: "customer@example.test", name: "Ada Customer" };

  const split = buildCheckoutInitializePayload(laborIntent, customer, {
    subaccountCode: "ACCT_TESTCODE",
  });
  assert.strictEqual(split.amount, 10000);
  assert.strictEqual(toCents(100), 10000);
  assert.strictEqual(split.reference, "EF-MERCHANTREF1234567");
  assert.strictEqual(split.currency, "ZAR");
  assert.strictEqual(split.email, "customer@example.test");
  assert.strictEqual(split.subaccount, "ACCT_TESTCODE");
  assert.strictEqual(split.bearer, "subaccount");
  assert.ok(!Object.prototype.hasOwnProperty.call(split, "transaction_charge"));
  assert.ok(!Object.prototype.hasOwnProperty.call(split, "percentage_charge"));
  assertInitializeSplitPayload(split);

  const accounting = splitCommission(100);
  assert.strictEqual(Number(accounting.commissionAmount), 7);
  assert.strictEqual(Number(accounting.recipientAmount), 93);
  assert.strictEqual(split.amount, 10000);
  assert.notStrictEqual(split.amount, toCents(93));

  const repayment = buildCheckoutInitializePayload(
    {
      id: "repay-1",
      merchantReference: "EFX-RR-ABCDEF1234567890",
      kind: "PROVIDER_REFUND_REPAYMENT",
      amount: 93,
      currency: "ZAR",
      jobId: "job-1",
    },
    customer,
    { subaccountCode: "ACCT_MUST_BE_IGNORED" }
  );
  assert.ok(!Object.prototype.hasOwnProperty.call(repayment, "subaccount"));
  assert.ok(!Object.prototype.hasOwnProperty.call(repayment, "bearer"));
  assert.ok(!Object.prototype.hasOwnProperty.call(repayment, "percentage_charge"));
  assert.ok(!Object.prototype.hasOwnProperty.call(repayment, "transaction_charge"));
  assert.strictEqual(repayment.reference, "EFX-RR-ABCDEF1234567890");
  assert.strictEqual(repayment.amount, 9300);
  assert.strictEqual(repayment.currency, "ZAR");
  assertInitializeRepaymentPayload(repayment);

  const delivery = buildCheckoutInitializePayload(
    {
      id: "del-1",
      merchantReference: "EF-DELIVERYREF0000001",
      kind: "DELIVERY_FEE",
      amount: 50,
      currency: "ZAR",
    },
    customer,
    { subaccountCode: "ACCT_MUST_BE_IGNORED" }
  );
  assert.ok(!Object.prototype.hasOwnProperty.call(delivery, "subaccount"));
  assert.ok(!Object.prototype.hasOwnProperty.call(delivery, "bearer"));

  assert.throws(
    () => buildCheckoutInitializePayload(laborIntent, customer, { subaccountCode: null }),
    (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED"
  );
}

function testBankCodeNeverBlindBranchCode() {
  const banks = [
    { name: "First National Bank", code: "001", currency: "ZAR", country: "South Africa" },
    { name: "ABSA Bank", code: "632005", currency: "ZAR", country: "South Africa" },
  ];
  const mapped = resolvePaystackBankCode(banks, "FNB", null);
  assert.strictEqual(mapped, "001");
  assert.notStrictEqual(mapped, "250655");
  assert.strictEqual(normalizeBankName("First National Bank"), "first national bank");

  const payload = buildCreateSubaccountPayload({
    businessName: "Test Provider",
    bankCode: mapped,
    accountNumber: "1234567890",
  });
  assert.strictEqual(payload.settlement_bank, "001");
  assert.notStrictEqual(payload.settlement_bank, "250655");
  assert.strictEqual(payload.percentage_charge, 7);
}

async function testCreateCheckoutHttpMocked() {
  const originalLookup = recipient.lookupMarketplaceSubaccount;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/transaction/initialize") && method === "POST") {
      return jsonResponse({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/mock",
          access_code: "access_mock",
          reference: "EF-MERCHANTREF1234567",
        },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  recipient.lookupMarketplaceSubaccount = async () => "ACCT_TESTCODE";
  try {
    await withEnv({ ...validTestEnv(), ENABLED_PAYMENT_PROVIDERS: "paystack" }, async () => {
      const result = await paystack.createCheckout(
        {
          id: "intent-1",
          merchantReference: "EF-MERCHANTREF1234567",
          kind: "LABOR",
          amount: 100,
          currency: "ZAR",
          jobId: "job-1",
        },
        { email: "customer@example.test" }
      );
      assert.strictEqual(result.type, "redirect");
      assert.strictEqual(result.url, "https://checkout.paystack.com/mock");
      assert.strictEqual(result.method, "GET");
      assert.strictEqual(fetchMock.calls.length, 1);
      const body = fetchMock.calls[0].body;
      assert.strictEqual(body.amount, 10000);
      assert.strictEqual(body.reference, "EF-MERCHANTREF1234567");
      assert.strictEqual(body.currency, "ZAR");
      assert.strictEqual(body.subaccount, "ACCT_TESTCODE");
      assert.strictEqual(body.bearer, "subaccount");
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "transaction_charge"));
    });
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
    fetchMock.restore();
  }
}

async function testRepaymentCheckoutHasNoSplit() {
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
  recipient.lookupMarketplaceSubaccount = async () => "ACCT_SHOULD_NOT_MATTER";
  try {
    await withEnv({ ...validTestEnv(), ENABLED_PAYMENT_PROVIDERS: "paystack" }, async () => {
      await paystack.createCheckout(
        {
          id: "repay-1",
          merchantReference: "EFX-RR-ABCDEF1234567890",
          kind: "PROVIDER_REFUND_REPAYMENT",
          amount: 93,
          currency: "ZAR",
        },
        { email: "provider@example.test" }
      );
      const body = fetchMock.calls[0].body;
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "subaccount"));
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "bearer"));
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "percentage_charge"));
      assert.ok(!Object.prototype.hasOwnProperty.call(body, "transaction_charge"));
    });
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
    fetchMock.restore();
  }
}

async function testPayoutDestinationDoesNotUseBranchCode() {
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/bank") && method === "GET") {
      return jsonResponse({
        status: true,
        data: [
          {
            name: "First National Bank",
            code: "001",
            currency: "ZAR",
            country: "South Africa",
          },
        ],
      });
    }
    if (url.includes("/subaccount") && method === "POST") {
      return jsonResponse({
        status: true,
        data: {
          subaccount_code: "ACCT_CREATED",
          percentage_charge: 7,
          active: true,
          is_verified: false,
          domain: "test",
        },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv({ ...validTestEnv() }, async () => {
      const result = await paystack.createPayoutDestination({
        scope: "provider",
        entityId: "prov-1",
        bankName: "FNB",
        accountHolder: "Test Provider",
        accountNumber: "1234567890",
        branchCode: "250655",
        accountType: "CHEQUE",
      });
      assert.strictEqual(result.supported, true);
      assert.strictEqual(result.recipientId, "ACCT_CREATED");
      const post = fetchMock.calls.find((c) => c.method === "POST");
      assert.ok(post, "expected subaccount POST");
      assert.strictEqual(post.body.settlement_bank, "001");
      assert.notStrictEqual(post.body.settlement_bank, "250655");
      assert.notStrictEqual(post.body.settlement_bank, post.body.branchCode);
      assert.ok(!Object.prototype.hasOwnProperty.call(post.body, "branchCode"));
      assert.strictEqual(post.body.percentage_charge, 7);
    });
  } finally {
    fetchMock.restore();
  }
}

async function testSettlementsDoNotTransfer() {
  const fetchMock = installFetchMock((url, method) => {
    throw new Error(`duplicate payout fetch ${method} ${url}`);
  });
  try {
    const intent = {
      merchantReference: "EF-MERCHANTREF1234567",
      gatewayTransactionId: "999",
      kind: "LABOR",
      amount: 100,
    };
    const provider = await paystack.createProviderSettlement(intent, {
      recipientId: "ACCT_X",
      netAmount: 93,
    });
    const supplier = await paystack.createSupplierSettlement(intent, {
      recipientId: "ACCT_Y",
      netAmount: 93,
    });
    assert.strictEqual(provider.supported, true);
    assert.strictEqual(provider.alreadySplitAtCharge, true);
    assert.strictEqual(provider.status, "COMPLETE");
    assert.strictEqual(provider.message, "paystack_split_at_charge_no_transfer");
    assert.strictEqual(supplier.supported, true);
    assert.strictEqual(supplier.alreadySplitAtCharge, true);
    assert.ok(!String(provider.message || "").includes("transfer") || provider.message === "paystack_split_at_charge_no_transfer");
    assert.strictEqual(fetchMock.calls.length, 0);
    assert.deepStrictEqual(alreadySplitSettlementResult(intent).settlementId, "999");
  } finally {
    fetchMock.restore();
  }
}

async function testRefundPendingNotFinal() {
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        message: "Refund has been queued for processing",
        data: { id: 18237078, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv({ ...validTestEnv() }, async () => {
      const raw = await paystack.refund("999", 93);
      assert.strictEqual(raw.ok, false);
      assert.strictEqual(raw.status, "PENDING");
      assert.strictEqual(raw.supported, true);
      assert.strictEqual(raw.requiresManualAction, true);
      assert.strictEqual(raw.externalRefundId, "18237078");
      const normalized = normalizeGatewayRefundResult(raw);
      assert.strictEqual(normalized.ok, false);
      assert.strictEqual(normalized.status, "PENDING");
      const classified = classifyGatewayRefundResult(normalized);
      assert.strictEqual(classified.success, false);
      assert.strictEqual(classified.failed, false);
      assert.strictEqual(classified.manualOnly, true);
    });
  } finally {
    fetchMock.restore();
  }

  const processed = mapPaystackRefundResult({ status: true, data: { id: 1, status: "processed" } }, true);
  assert.strictEqual(processed.ok, true);
  assert.strictEqual(processed.status, "COMPLETED");
}

async function testVerifyTransactionMocked() {
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/transaction/verify/") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 44, status: "success", reference: "EF-MERCHANTREF1234567", amount: 10000, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv({ ...validTestEnv() }, async () => {
      const out = await paystack.verifyTransaction("EF-MERCHANTREF1234567");
      assert.strictEqual(out.state, "PAID");
      assert.strictEqual(out.merchantReference, "EF-MERCHANTREF1234567");
      assert.strictEqual(out.amount, 100);
    });
  } finally {
    fetchMock.restore();
  }
}

function testWebhookSignaturePrimitive() {
  withEnv({ ...validTestEnv() }, () => {
    const raw = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "EF-1", status: "success", amount: 10000, id: 8 } }));
    const sig = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(raw)
      .digest("hex");
    const ok = paystack.verifyWebhook(raw, sig);
    assert.strictEqual(ok.valid, true);
    assert.strictEqual(ok.state, "PAID");
    assert.strictEqual(ok.merchantReference, "EF-1");
    const bad = paystack.verifyWebhook(raw, "00".repeat(64));
    assert.strictEqual(bad.valid, false);
  });
}

function testSettlementCapableGatewaySeesPaystack() {
  withEnv(
    {
      ...validTestEnv(),
      ENABLED_PAYMENT_PROVIDERS: "paystack",
      MARKETPLACE_SETTLEMENT_ENABLED: "true",
    },
    () => {
      const gw = settlementCapableGateway();
      assert.ok(gw);
      assert.strictEqual(gw.name, "PAYSTACK");
      assert.strictEqual(gw.supportsMarketplaceSettlement(), true);
    }
  );
}

function testExtractSubaccountReuse() {
  assert.strictEqual(
    recipient.extractSubaccount({
      gatewayRecipientId: "ACCT_EXISTING",
      gatewayProvider: "PAYSTACK",
      isActive: true,
    }),
    "ACCT_EXISTING"
  );
  assert.strictEqual(
    recipient.extractSubaccount({
      gatewayRecipientId: "ACCT_EXISTING",
      gatewayProvider: "PAYFAST",
      isActive: true,
    }),
    null
  );
}

async function main() {
  testNormalizeProvider();
  testEnabledRegistry();
  testFailClosedKeys();
  testCheckoutPayloadSplitAndRepayment();
  testBankCodeNeverBlindBranchCode();
  testExtractSubaccountReuse();
  testSettlementCapableGatewaySeesPaystack();
  testWebhookSignaturePrimitive();
  await testCreateCheckoutHttpMocked();
  await testRepaymentCheckoutHasNoSplit();
  await testPayoutDestinationDoesNotUseBranchCode();
  await testSettlementsDoNotTransfer();
  await testRefundPendingNotFinal();
  await testVerifyTransactionMocked();
  console.log("paystack.gateway.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
