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
  settlementGatewayForIntent,
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
  sanitizePaystackWebhookRaw,
  mapPaystackChargeEventState,
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

  const material = buildCheckoutInitializePayload(
    {
      id: "mat-1",
      merchantReference: "EF-MATERIALREF1234567",
      kind: "MATERIAL_ORDER",
      amount: 100,
      currency: "ZAR",
      materialOrderId: "mo-1",
    },
    customer,
    { subaccountCode: "ACCT_BRANCH" }
  );
  assert.strictEqual(material.subaccount, "ACCT_BRANCH");
  assert.strictEqual(material.bearer, "subaccount");
  assert.ok(!Object.prototype.hasOwnProperty.call(material, "transaction_charge"));

  const delivery = buildCheckoutInitializePayload(
    {
      id: "del-1",
      merchantReference: "EF-DELIVERYREF0000001",
      kind: "DELIVERY_FEE",
      amount: 50,
      currency: "ZAR",
    },
    customer,
    { subaccountCode: "ACCT_COURIER" }
  );
  assert.strictEqual(delivery.amount, 5000);
  assert.strictEqual(delivery.subaccount, "ACCT_COURIER");
  assert.strictEqual(delivery.bearer, "subaccount");
  assert.ok(!Object.prototype.hasOwnProperty.call(delivery, "transaction_charge"));
  assertInitializeSplitPayload(delivery);

  assert.throws(
    () =>
      buildCheckoutInitializePayload(
        {
          id: "del-2",
          merchantReference: "EF-DELIVERYREF0000002",
          kind: "DELIVERY_FEE",
          amount: 50,
          currency: "ZAR",
        },
        customer,
        { subaccountCode: null }
      ),
    (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED"
  );

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
      assert.strictEqual(raw.pending, true);
      assert.strictEqual(raw.status, "PENDING");
      assert.strictEqual(raw.supported, true);
      assert.strictEqual(raw.requiresManualAction, false);
      assert.strictEqual(raw.externalRefundId, "18237078");
      const normalized = normalizeGatewayRefundResult(raw);
      assert.strictEqual(normalized.ok, false);
      assert.strictEqual(normalized.pending, true);
      assert.strictEqual(normalized.status, "PENDING");
      const classified = classifyGatewayRefundResult(normalized);
      assert.strictEqual(classified.success, false);
      assert.strictEqual(classified.failed, false);
      assert.strictEqual(classified.manualOnly, false);
      assert.strictEqual(classified.pending, true);
    });
  } finally {
    fetchMock.restore();
  }

  const processed = mapPaystackRefundResult({ status: true, data: { id: 1, status: "processed" } }, true);
  assert.strictEqual(processed.ok, true);
  assert.strictEqual(processed.pending, false);
  assert.strictEqual(processed.status, "COMPLETED");

  const needs = mapPaystackRefundResult({ status: true, data: { id: 2, status: "needs-attention" } }, true);
  assert.strictEqual(needs.ok, false);
  assert.strictEqual(needs.pending, true);
  assert.strictEqual(needs.status, "NEEDS_ATTENTION");
  assert.strictEqual(needs.requiresManualAction, true);
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
    const payload = {
      event: "charge.success",
      data: {
        reference: "EF-1",
        status: "success",
        amount: 10000,
        id: 8,
        authorization: {
          authorization_code: "AUTH_SECRET",
          bin: "408408",
          last4: "4242",
          brand: "visa",
          reusable: true,
          bank: "TEST BANK",
        },
        customer: { email: "hidden@example.test", phone: "0800000000" },
      },
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const sig = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(raw)
      .digest("hex");
    const ok = paystack.verifyWebhook(raw, sig);
    assert.strictEqual(ok.valid, true);
    assert.strictEqual(ok.state, "PAID");
    assert.strictEqual(ok.merchantReference, "EF-1");
    assert.strictEqual(ok.raw.card_last4, "4242");
    assert.strictEqual(ok.raw.card_brand, "visa");
    assert.ok(!ok.raw.authorization);
    assert.ok(!ok.raw.customer);
    assert.ok(!ok.raw.authorization_code);
    assert.ok(!JSON.stringify(ok.raw).includes("AUTH_SECRET"));
    assert.ok(!JSON.stringify(ok.raw).includes("hidden@example.test"));
    const bad = paystack.verifyWebhook(raw, "00".repeat(64));
    assert.strictEqual(bad.valid, false);
  });
}

function testUnrelatedPaystackEventsDoNotSettle() {
  withEnv({ ...validTestEnv() }, () => {
    const refundBody = {
      event: "refund.processed",
      data: { reference: "EF-1", status: "success", amount: 10000, id: 99 },
    };
    const raw = Buffer.from(JSON.stringify(refundBody));
    const sig = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
    const out = paystack.verifyWebhook(raw, sig);
    assert.strictEqual(out.valid, true);
    assert.notStrictEqual(out.state, "PAID");
    assert.strictEqual(out.state, "PROCESSING");
    assert.strictEqual(mapPaystackChargeEventState("refund.processed"), null);
    assert.strictEqual(mapPaystackChargeEventState("transfer.success"), null);
    assert.strictEqual(mapPaystackChargeEventState("invoice.update"), null);
    assert.strictEqual(mapPaystackChargeEventState("charge.success"), "PAID");
    assert.strictEqual(mapPaystackChargeEventState("charge.failed"), "FAILED");
  });
}

function testSanitizeWebhookRaw() {
  const raw = sanitizePaystackWebhookRaw({
    event: "charge.success",
    data: {
      reference: "EF-X",
      id: 1,
      status: "success",
      amount: 10000,
      currency: "ZAR",
      channel: "card",
      fees: 449,
      fees_split: { paystack: 449, integration: 700, subaccount: 8851 },
      subaccount: "ACCT_X",
      authorization: { authorization_code: "AUTH_X", bin: "408408", last4: "1111", brand: "mastercard" },
      customer: { email: "no@store.test", phone: "1" },
    },
  });
  assert.strictEqual(raw.event, "charge.success");
  assert.strictEqual(raw.reference, "EF-X");
  assert.strictEqual(raw.card_last4, "1111");
  assert.strictEqual(raw.card_brand, "mastercard");
  assert.strictEqual(raw.subaccount, "ACCT_X");
  assert.ok(!raw.authorization);
  assert.ok(!raw.customer);
  assert.ok(!raw.bin);
  assert.ok(!Object.prototype.hasOwnProperty.call(raw, "authorization_code"));
}

function testSanitizeWebhookRawSubaccountObject() {
  const raw = sanitizePaystackWebhookRaw({
    event: "charge.success",
    data: {
      reference: "EF-SAFE",
      id: 9,
      status: "success",
      amount: 10000,
      currency: "ZAR",
      subaccount: {
        subaccount_code: "ACCT_SAFE",
        account_number: "1234567890",
        settlement_bank: "Example Bank",
      },
      authorization: { authorization_code: "AUTH_KEEP_OUT", bank: "Example Bank", bin: "408408" },
      customer: { email: "no@store.test" },
    },
  });
  assert.strictEqual(raw.subaccount, "ACCT_SAFE");
  const serialized = JSON.stringify(raw);
  assert.ok(!serialized.includes("1234567890"));
  assert.ok(!serialized.includes("Example Bank"));
  assert.ok(!serialized.includes("AUTH_KEEP_OUT"));
  assert.ok(!raw.account_number);
  assert.ok(!raw.settlement_bank);
  assert.ok(!raw.authorization);
  assert.ok(!raw.customer);
}

function testInvalidSubaccountCodesRejected() {
  const blank = paystack.updatePayoutDestination("", { bankName: "FNB" });
  const numeric = paystack.updatePayoutDestination("123", { bankName: "FNB" });
  const transfer = paystack.updatePayoutDestination("TRF_ABC", { bankName: "FNB" });
  const deactivateNumeric = paystack.deactivatePayoutDestination("123");
  const deactivateTransfer = paystack.deactivatePayoutDestination("TRF_ABC");
  const statusNumeric = paystack.getPayoutDestinationStatus("123");
  const statusTransfer = paystack.getPayoutDestinationStatus("TRF_ABC");
  return Promise.all([
    blank,
    numeric,
    transfer,
    deactivateNumeric,
    deactivateTransfer,
    statusNumeric,
    statusTransfer,
  ]).then(([a, b, c, d, e, f, g]) => {
    assert.strictEqual(a.supported, false);
    assert.strictEqual(a.message, "invalid_subaccount_code");
    assert.strictEqual(b.supported, false);
    assert.strictEqual(b.message, "invalid_subaccount_code");
    assert.strictEqual(c.supported, false);
    assert.strictEqual(c.message, "invalid_subaccount_code");
    assert.strictEqual(d.supported, false);
    assert.strictEqual(d.message, "invalid_subaccount_code");
    assert.strictEqual(e.supported, false);
    assert.strictEqual(e.message, "invalid_subaccount_code");
    assert.strictEqual(f.supported, false);
    assert.strictEqual(f.message, "invalid_subaccount_code");
    assert.strictEqual(g.supported, false);
    assert.strictEqual(g.message, "invalid_subaccount_code");
  });
}

async function testValidSubaccountCodeAcceptedForUpdate() {
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/bank") && method === "GET") {
      return jsonResponse({
        status: true,
        data: [{ name: "First National Bank", code: "001", currency: "ZAR", country: "South Africa" }],
      });
    }
    if (url.includes("/subaccount/") && method === "PUT") {
      return jsonResponse({
        status: true,
        data: { subaccount_code: "ACCT_VALID", percentage_charge: 7, active: true, is_verified: true },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv({ ...validTestEnv() }, async () => {
      const result = await paystack.updatePayoutDestination("ACCT_VALID", {
        bankName: "FNB",
        accountHolder: "Test",
        accountNumber: "1234567890",
        branchCode: "250655",
      });
      assert.strictEqual(result.supported, true);
      assert.strictEqual(result.recipientId, "ACCT_VALID");
    });
  } finally {
    fetchMock.restore();
  }
}

function testJobStoreRecipientMatch() {
  const orders = [
    { orderId: "ord-a", storeId: "branch-a", branchId: "branch-a" },
    { orderId: "ord-b", storeId: "branch-b" },
  ];
  const hit = recipient.matchJobStoreOrderByOrderId(orders, "ord-a");
  assert.strictEqual(hit.match.storeId, "branch-a");
  assert.strictEqual(recipient.branchIdFromStoreOrder(hit.match), "branch-a");
  const miss = recipient.matchJobStoreOrderByOrderId(orders, "");
  assert.strictEqual(miss.match, null);
  assert.strictEqual(miss.reason, "missing_order_id");
  const unknown = recipient.matchJobStoreOrderByOrderId(orders, "ord-z");
  assert.strictEqual(unknown.match, null);
  const dupes = recipient.matchJobStoreOrderByOrderId(
    [
      { orderId: "same", storeId: "b1" },
      { orderId: "same", storeId: "b2" },
    ],
    "same"
  );
  assert.strictEqual(dupes.match, null);
  assert.strictEqual(dupes.reason, "ambiguous_order_id");
}

async function testCourierDeliveryLookupUsesProviderSubaccount() {
  const fakePrisma = {
    deliveryRequest: {
      findUnique: async () => ({ courierId: "user-courier" }),
    },
    provider: {
      findUnique: async () => ({ id: "prov-1" }),
    },
    providerWithdrawalProfile: {
      findUnique: async () => ({
        gatewayRecipientId: "ACCT_COURIER",
        gatewayProvider: "PAYSTACK",
        isActive: true,
      }),
    },
  };
  const code = await recipient.lookupMarketplaceSubaccount(
    { kind: "DELIVERY_FEE", gatewayPayload: { deliveryRequestId: "dr-1" } },
    fakePrisma
  );
  assert.strictEqual(code, "ACCT_COURIER");
}

async function testUnresolvedDeliveryFailsClosed() {
  await assert.rejects(
    () => recipient.lookupMarketplaceSubaccount({ kind: "DELIVERY_FEE", gatewayPayload: {} }, {}),
    (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED"
  );
}

async function testJobStoreLookupResolvableWithoutMaterialOrderId() {
  const fakePrisma = {
    materialOrder: { findUnique: async () => null },
    job: {
      findUnique: async () => ({
        meta: {
          storeOrders: [{ orderId: "ord-1", storeId: "branch-1", branchId: "branch-1" }],
        },
      }),
    },
    branchWithdrawalProfile: {
      findUnique: async ({ where }) => {
        assert.strictEqual(where.branchId, "branch-1");
        return {
          gatewayRecipientId: "ACCT_STORE",
          gatewayProvider: "PAYSTACK",
          isActive: true,
        };
      },
    },
  };
  const code = await recipient.lookupMarketplaceSubaccount(
    {
      kind: "JOB_STORE_ORDER",
      jobId: "job-1",
      gatewayPayload: { orderId: "ord-1" },
    },
    fakePrisma
  );
  assert.strictEqual(code, "ACCT_STORE");
}

async function testJobStoreLookupFailsClosedWithoutOrderId() {
  await assert.rejects(
    () =>
      recipient.lookupMarketplaceSubaccount(
        { kind: "JOB_STORE_ORDER", jobId: "job-1", gatewayPayload: { supplierId: "store-x" } },
        { materialOrder: { findUnique: async () => null } }
      ),
    (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED"
  );
}

function testSettlementGatewayBoundToIntentProvider() {
  withEnv(
    {
      ...validTestEnv(),
      ENABLED_PAYMENT_PROVIDERS: "payfast,paystack",
      MARKETPLACE_SETTLEMENT_ENABLED: "true",
      PAYFAST_MERCHANT_ID: "10000100",
      PAYFAST_MERCHANT_KEY: "testkey",
      PAYFAST_MODE: "sandbox",
    },
    () => {
      const payfastGw = settlementGatewayForIntent({ provider: "PAYFAST" });
      assert.strictEqual(payfastGw, null, "PayFast must not use Paystack settlement");
      const paystackGw = settlementGatewayForIntent({ provider: "PAYSTACK" });
      assert.ok(paystackGw);
      assert.strictEqual(paystackGw.name, "PAYSTACK");
      const flexGw = settlementGatewayForIntent({ provider: "PAYFLEX" });
      assert.strictEqual(flexGw, null);
    }
  );
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
  testJobStoreRecipientMatch();
  await testCourierDeliveryLookupUsesProviderSubaccount();
  await testUnresolvedDeliveryFailsClosed();
  await testJobStoreLookupResolvableWithoutMaterialOrderId();
  await testJobStoreLookupFailsClosedWithoutOrderId();
  testSettlementCapableGatewaySeesPaystack();
  testSettlementGatewayBoundToIntentProvider();
  testWebhookSignaturePrimitive();
  testUnrelatedPaystackEventsDoNotSettle();
  testSanitizeWebhookRaw();
  testSanitizeWebhookRawSubaccountObject();
  await testInvalidSubaccountCodesRejected();
  await testValidSubaccountCodeAcceptedForUpdate();
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
