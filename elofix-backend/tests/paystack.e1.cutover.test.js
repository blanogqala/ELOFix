/**
 * Phase E1 — Paystack live-cutover hardening: domain isolation, credentials,
 * registration recreation, and transaction identification metadata.
 * Run: node tests/paystack.e1.cutover.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const {
  assertPaystackCredentials,
  isPaystackConfigured,
  assertProductionPaymentSafety,
  assertProductionPaystackSafety,
} = require("../src/services/payments/paymentConfig");
const { listEnabledGateways } = require("../src/services/payments/gatewayRegistry");
const recipient = require("../src/services/payments/paystack.recipient");
const payoutDestinationService = require("../src/services/payoutDestination.service");
const paystack = require("../src/services/payments/paystack.gateway");
const { splitCommission } = require("../src/services/payments/money.util");
const {
  buildCheckoutInitializePayload,
  buildPaystackPaymentDescriptor,
  requiredPaystackDomain,
  isPaystackRecipientUsableInCurrentMode,
} = require("../src/services/payments/paystack.payload");

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

function paystackProfile({ code = "ACCT_TEST", domain = "test", active = true, provider = "PAYSTACK" } = {}) {
  return {
    gatewayProvider: provider,
    gatewayRecipientId: code,
    isActive: active,
    gatewayProfilePayload: domain == null ? null : { domain },
  };
}

function customer() {
  return { email: "customer@example.test", name: "Ada Customer" };
}

function laborIntent(paymentType) {
  return {
    id: "intent-e1",
    merchantReference: "EF-MERCHANTREF1234567",
    kind: "LABOR",
    paymentType,
    amount: 100,
    currency: "ZAR",
    jobId: "job-1",
    materialOrderId: null,
  };
}

function assertNoSensitiveMetadata(payload) {
  const raw = JSON.stringify(payload);
  assert.doesNotMatch(raw, /account[_ ]?number/i);
  assert.doesNotMatch(raw, /branch[_ ]?code/i);
  assert.doesNotMatch(raw, /id[_ ]?number/i);
  assert.doesNotMatch(raw, /authorization_code/i);
  assert.doesNotMatch(raw, /sk_live_|sk_test_|pk_live_|pk_test_/);
  assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  assert.doesNotMatch(raw, /"password"/i);
  assert.ok(!payload.metadata.accountNumber);
  assert.ok(!payload.metadata.branchCode);
  assert.ok(!payload.metadata.authorization);
  assert.ok(!payload.metadata.gatewayProfilePayload);
}

function testRequiredDomainFromModeNotNodeEnv() {
  withEnv({ PAYSTACK_MODE: "test", NODE_ENV: "production" }, () => {
    assert.strictEqual(requiredPaystackDomain(), "test");
  });
  withEnv({ PAYSTACK_MODE: "live", NODE_ENV: "development" }, () => {
    assert.strictEqual(requiredPaystackDomain(), "live");
  });
  withEnv({ PAYSTACK_MODE: undefined, NODE_ENV: "production" }, () => {
    assert.strictEqual(requiredPaystackDomain(), null);
  });
}

function test1TestRecipientAcceptedInTestMode() {
  withEnv({ PAYSTACK_MODE: "test" }, () => {
    const profile = paystackProfile({ code: "ACCT_TEST", domain: "test" });
    assert.strictEqual(isPaystackRecipientUsableInCurrentMode(profile), true);
    assert.strictEqual(recipient.extractSubaccount(profile), "ACCT_TEST");
  });
}

function test2TestRecipientRejectedInLiveMode() {
  withEnv({ PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_unit_not_a_real_key" }, () => {
    const profile = paystackProfile({ code: "ACCT_TEST", domain: "test" });
    assert.strictEqual(isPaystackRecipientUsableInCurrentMode(profile), false);
    assert.strictEqual(recipient.extractSubaccount(profile), null);
    assert.throws(
      () =>
        buildCheckoutInitializePayload(laborIntent("DEPOSIT"), customer(), {
          subaccountCode: recipient.extractSubaccount(profile),
        }),
      (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED"
    );
  });
}

function test3LiveRecipientAcceptedInLiveMode() {
  withEnv({ PAYSTACK_MODE: "live" }, () => {
    const profile = paystackProfile({ code: "ACCT_LIVE", domain: "live" });
    assert.strictEqual(isPaystackRecipientUsableInCurrentMode(profile), true);
    assert.strictEqual(recipient.extractSubaccount(profile), "ACCT_LIVE");
  });
}

function test4LiveRecipientRejectedInTestMode() {
  withEnv({ PAYSTACK_MODE: "test" }, () => {
    const profile = paystackProfile({ code: "ACCT_LIVE", domain: "live" });
    assert.strictEqual(isPaystackRecipientUsableInCurrentMode(profile), false);
    assert.strictEqual(recipient.extractSubaccount(profile), null);
    assert.throws(
      () =>
        buildCheckoutInitializePayload(laborIntent("DEPOSIT"), customer(), {
          subaccountCode: recipient.extractSubaccount(profile),
        }),
      (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED"
    );
  });
}

function test5MissingDomainFailsClosed() {
  withEnv({ PAYSTACK_MODE: "test" }, () => {
    const missingPayload = {
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: "ACCT_LEGACY",
      isActive: true,
    };
    assert.strictEqual(recipient.extractSubaccount(missingPayload), null);
    assert.strictEqual(
      recipient.extractSubaccount(paystackProfile({ code: "ACCT_LEGACY", domain: null })),
      null
    );
    assert.strictEqual(
      recipient.extractSubaccount({
        gatewayProvider: "PAYSTACK",
        gatewayRecipientId: "ACCT_LEGACY",
        isActive: true,
        gatewayProfilePayload: { domain: "unknown" },
      }),
      null
    );
  });
}

function test6DomainMismatchRegistrationCreatesNotPuts() {
  const paystackGw = { name: "PAYSTACK" };
  const storedTest = paystackProfile({ code: "ACCT_TEST", domain: "test" });
  withEnv({ PAYSTACK_MODE: "live", PAYSTACK_SECRET_KEY: "sk_live_unit_not_a_real_key" }, () => {
    assert.strictEqual(payoutDestinationService.shouldUpdateExistingRecipient(storedTest, paystackGw), false);
    assert.strictEqual(
      payoutDestinationService.recipientIdToPersist(paystackGw, { supported: false }, storedTest),
      null,
      "must not copy/relabel the TEST ACCT code as LIVE"
    );
  });
  withEnv({ PAYSTACK_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key" }, () => {
    assert.strictEqual(payoutDestinationService.shouldUpdateExistingRecipient(storedTest, paystackGw), true);
    assert.strictEqual(
      payoutDestinationService.shouldUpdateExistingRecipient(
        paystackProfile({ code: "ACCT_LIVE", domain: "live" }),
        paystackGw
      ),
      false
    );
  });
}

async function test6DomainMismatchRegisterHttp() {
  const creates = [];
  const updates = [];
  const originalCreate = paystack.createPayoutDestination;
  const originalUpdate = paystack.updatePayoutDestination;
  paystack.createPayoutDestination = async (payload) => {
    creates.push(payload);
    return {
      supported: true,
      recipientId: "ACCT_NEW_LIVE",
      status: "VERIFIED",
      data: { subaccount_code: "ACCT_NEW_LIVE", domain: "live", percentage_charge: 7 },
    };
  };
  paystack.updatePayoutDestination = async (id) => {
    updates.push(id);
    throw new Error(`must not PUT existing test ACCT ${id}`);
  };

  const prisma = require("../src/config/prisma");
  if (!process.env.DATABASE_URL || String(process.env.DATABASE_URL).includes("placeholder")) {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    return;
  }

  const { randomUUID } = require("crypto");
  const suffix = randomUUID().slice(0, 8);
  let fix = null;
  try {
    const supplierUser = await prisma.user.create({
      data: {
        email: `e1.sup.${suffix}@example.com`,
        password: "x",
        name: "Supplier",
        role: "SUPPLIER",
      },
    });
    const supplier = await prisma.supplier.create({
      data: { userId: supplierUser.id, name: `E1 ${suffix}`, businessName: `E1 ${suffix}` },
    });
    const branch = await prisma.branch.create({
      data: {
        id: randomUUID(),
        supplierId: supplier.id,
        name: `E1 Branch ${suffix}`,
        address: "1 Test",
        products: [],
      },
    });
    const profile = await prisma.branchWithdrawalProfile.create({
      data: {
        id: randomUUID(),
        branchId: branch.id,
        bankName: "FNB",
        accountHolder: "Branch Holder",
        accountNumber: "enc:test",
        branchCode: "enc:test",
        verificationStatus: "VERIFIED",
        isActive: true,
        gatewayProvider: "PAYSTACK",
        gatewayRecipientId: "ACCT_TEST",
        gatewayProfilePayload: { domain: "test" },
      },
    });
    fix = { supplierUser, supplier, branch, profile };
    await withEnv(
      {
        MARKETPLACE_SETTLEMENT_ENABLED: "true",
        ENABLED_PAYMENT_PROVIDERS: "paystack",
        PAYSTACK_MODE: "live",
        PAYSTACK_SECRET_KEY: "sk_live_unit_not_a_real_key",
        PAYSTACK_PUBLIC_KEY: "pk_live_unit_not_a_real_key",
      },
      async () => {
        const out = await payoutDestinationService.registerPayoutDestination({
          scope: "branch",
          entityId: branch.id,
        });
        assert.strictEqual(out.recipientId, "ACCT_NEW_LIVE");
        assert.strictEqual(creates.length, 1);
        assert.strictEqual(updates.length, 0);
      }
    );
    const fresh = await prisma.branchWithdrawalProfile.findUnique({ where: { id: profile.id } });
    assert.strictEqual(fresh.gatewayRecipientId, "ACCT_NEW_LIVE");
    assert.strictEqual(fresh.gatewayProfilePayload?.domain, "live");
    assert.notStrictEqual(fresh.gatewayRecipientId, "ACCT_TEST");
  } finally {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    if (fix) {
      await prisma.branchWithdrawalProfile.delete({ where: { id: fix.profile.id } }).catch(() => {});
      await prisma.branch.delete({ where: { id: fix.branch.id } }).catch(() => {});
      await prisma.supplier.delete({ where: { id: fix.supplier.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: fix.supplierUser.id } }).catch(() => {});
    }
  }
}

function test7LiveModeRejectsTestSecret() {
  withEnv(
    {
      NODE_ENV: "production",
      ENABLED_PAYMENT_PROVIDERS: "paystack",
      PAYSTACK_MODE: "live",
      PAYSTACK_SECRET_KEY: "sk_test_must_fail_closed",
      PAYFAST_SKIP_IP_CHECK: undefined,
      PAYFAST_SETTLE_ON_RETURN: undefined,
    },
    () => {
      assert.strictEqual(isPaystackConfigured(), false);
      assert.throws(() => assertPaystackCredentials(), (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH");
      assert.throws(
        () => assertProductionPaymentSafety(),
        (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH"
      );
    }
  );
}

function test8TestModeRejectsLiveSecret() {
  withEnv(
    {
      NODE_ENV: "production",
      ENABLED_PAYMENT_PROVIDERS: "paystack",
      PAYSTACK_MODE: "test",
      PAYSTACK_SECRET_KEY: "sk_live_must_fail_closed",
      PAYFAST_SKIP_IP_CHECK: undefined,
      PAYFAST_SETTLE_ON_RETURN: undefined,
    },
    () => {
      assert.strictEqual(isPaystackConfigured(), false);
      assert.throws(() => assertPaystackCredentials(), (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH");
      assert.throws(
        () => assertProductionPaystackSafety(),
        (err) => err.code === "PAYSTACK_KEY_MODE_MISMATCH"
      );
    }
  );
}

function test9PaystackDisabledIgnoresInvalidCredentials() {
  withEnv(
    {
      NODE_ENV: "production",
      ENABLED_PAYMENT_PROVIDERS: "payfast,payflex,payjustnow",
      PAYSTACK_MODE: "live",
      PAYSTACK_SECRET_KEY: "sk_test_invalid_when_disabled",
      PAYFAST_MODE: "sandbox",
      PAYFAST_SKIP_IP_CHECK: undefined,
      PAYFAST_SETTLE_ON_RETURN: undefined,
    },
    () => {
      assert.doesNotThrow(() => assertProductionPaymentSafety());
      assert.doesNotThrow(() => assertProductionPaystackSafety());
      assert.ok(!listEnabledGateways().includes("PAYSTACK"));
    }
  );
}

function customField(payload, variableName) {
  const fields = payload.metadata?.custom_fields || [];
  return fields.find((f) => f.variable_name === variableName);
}

function test10DepositMetadata() {
  const payload = buildCheckoutInitializePayload(laborIntent("DEPOSIT"), customer(), {
    subaccountCode: "ACCT_TEST",
  });
  assert.strictEqual(payload.reference, "EF-MERCHANTREF1234567");
  assert.strictEqual(payload.metadata.intentId, "intent-e1");
  assert.strictEqual(payload.metadata.kind, "LABOR");
  assert.strictEqual(payload.metadata.jobId, "job-1");
  assert.strictEqual(payload.metadata.materialOrderId, null);
  assert.strictEqual(payload.metadata.paymentType, "DEPOSIT");
  assert.strictEqual(payload.metadata.paymentCategory, "SERVICE");
  assert.strictEqual(payload.metadata.paymentStage, "DEPOSIT");
  assert.strictEqual(payload.metadata.paymentLabel, "Service Deposit - First 50%");
  assert.strictEqual(customField(payload, "elofix_payment").value, "Service Deposit - First 50%");
  assert.strictEqual(customField(payload, "elofix_payment_category").value, "SERVICE");
  assert.strictEqual(customField(payload, "elofix_payment_stage").value, "DEPOSIT");
  assert.strictEqual(customField(payload, "elofix_payment").display_name, "EloFix Payment");
}

function test11CompletionMetadata() {
  const payload = buildCheckoutInitializePayload(laborIntent("COMPLETION"), customer(), {
    subaccountCode: "ACCT_TEST",
  });
  assert.strictEqual(payload.metadata.paymentLabel, "Service Completion - Final 50%");
  assert.strictEqual(payload.metadata.paymentStage, "COMPLETION");
  assert.strictEqual(customField(payload, "elofix_payment").value, "Service Completion - Final 50%");
  const upfront = buildPaystackPaymentDescriptor(laborIntent("FULL_UPFRONT"));
  assert.strictEqual(upfront.paymentLabel, "Service Payment - Full Upfront");
  assert.doesNotMatch(upfront.paymentLabel, /50%/);
  const completion = buildPaystackPaymentDescriptor(laborIntent("FULL_COMPLETION"));
  assert.strictEqual(completion.paymentLabel, "Service Payment - Pay on Completion");
  assert.doesNotMatch(completion.paymentLabel, /50%/);
}

function test12MaterialsMetadata() {
  const payload = buildCheckoutInitializePayload(
    {
      id: "mat-1",
      merchantReference: "EF-MATERIALREF1234567",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      amount: 100,
      currency: "ZAR",
      materialOrderId: "mo-1",
    },
    customer(),
    { subaccountCode: "ACCT_BRANCH" }
  );
  assert.strictEqual(payload.metadata.paymentCategory, "MATERIALS");
  assert.strictEqual(payload.metadata.paymentLabel, "Materials Payment");
  assert.strictEqual(payload.metadata.kind, "MATERIAL_ORDER");
  const jobStore = buildCheckoutInitializePayload(
    {
      id: "js-1",
      merchantReference: "EF-JOBSTORE000000001",
      kind: "JOB_STORE_ORDER",
      paymentType: "JOB_STORE_ORDER",
      amount: 100,
      currency: "ZAR",
    },
    customer(),
    { subaccountCode: "ACCT_BRANCH" }
  );
  assert.strictEqual(jobStore.metadata.paymentCategory, "MATERIALS");
  assert.strictEqual(jobStore.metadata.paymentLabel, "Job Materials Payment");
}

function test13DeliveryMetadata() {
  const payload = buildCheckoutInitializePayload(
    {
      id: "del-1",
      merchantReference: "EF-DELIVERYREF0000001",
      kind: "DELIVERY_FEE",
      paymentType: "DELIVERY_FEE",
      amount: 50,
      currency: "ZAR",
    },
    customer(),
    { subaccountCode: "ACCT_COURIER" }
  );
  assert.strictEqual(payload.metadata.paymentCategory, "DELIVERY");
  assert.strictEqual(payload.metadata.paymentLabel, "Delivery Fee");
}

function test14ProviderRefundRepaymentUnsplit() {
  const payload = buildCheckoutInitializePayload(
    {
      id: "repay-1",
      merchantReference: "EFX-RR-ABCDEF1234567890",
      kind: "PROVIDER_REFUND_REPAYMENT",
      paymentType: null,
      amount: 93,
      currency: "ZAR",
      jobId: "job-1",
    },
    customer(),
    { subaccountCode: "ACCT_MUST_BE_IGNORED" }
  );
  assert.strictEqual(payload.metadata.paymentCategory, "REFUND_RECOVERY");
  assert.strictEqual(payload.metadata.paymentLabel, "Provider Refund Repayment");
  assert.strictEqual(payload.metadata.paymentStage, "PROVIDER_REFUND_REPAYMENT");
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "subaccount"));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "bearer"));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "transaction_charge"));
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "percentage_charge"));
}

function test15MetadataContainsNoSensitiveBankingFields() {
  const payload = buildCheckoutInitializePayload(
    {
      ...laborIntent("DEPOSIT"),
      accountNumber: "1234567890",
      branchCode: "250655",
      gatewayProfilePayload: { account_number: "1234567890", authorization: "AUTH_SECRET" },
    },
    customer(),
    { subaccountCode: "ACCT_TEST" }
  );
  assertNoSensitiveMetadata(payload);
}

function test16PayfastUnchanged() {
  const payfast = require("../src/services/payments/payfast.gateway");
  assert.strictEqual(payfast.name, "PAYFAST");
  assert.ok(typeof payfast.createCheckout === "function");
  assert.ok(typeof payfast.verifyWebhook === "function");
  return Promise.all([payfast.createProviderSettlement(), payfast.createSupplierSettlement()]).then(
    ([provider, supplier]) => {
      assert.strictEqual(provider.supported, false);
      assert.strictEqual(supplier.supported, false);
      assert.ok(provider.alreadySplitAtCharge !== true);
      assert.ok(supplier.alreadySplitAtCharge !== true);
    }
  );
}

function test17SplitEconomicsNoSecondTransfer() {
  const accounting = splitCommission(100);
  assert.strictEqual(Number(accounting.commissionAmount), 7);
  assert.strictEqual(Number(accounting.recipientAmount), 93);
  const payload = buildCheckoutInitializePayload(laborIntent("DEPOSIT"), customer(), {
    subaccountCode: "ACCT_TEST",
  });
  assert.strictEqual(payload.amount, 10000);
  assert.notStrictEqual(payload.amount, 9300);
  return Promise.all([
    paystack.createProviderSettlement({
      provider: "PAYSTACK",
      merchantReference: "EF-MERCHANTREF1234567",
      gatewayTransactionId: "999",
    }),
    paystack.createSupplierSettlement(
      {
        provider: "PAYSTACK",
        merchantReference: "EF-MERCHANTREF1234567",
        gatewayTransactionId: "999",
        gatewayPayload: { subaccount: "ACCT_TEST" },
      },
      { recipientId: "ACCT_TEST", netAmount: 93 }
    ),
  ]).then(([provider, supplier]) => {
    assert.strictEqual(provider.alreadySplitAtCharge, true);
    assert.strictEqual(supplier.alreadySplitAtCharge, true);
    assert.strictEqual(provider.message, "paystack_split_at_charge_no_transfer");
  });
}

async function testCheckoutLookupRejectsCrossDomainRecipient() {
  const originalLookup = recipient.lookupMarketplaceSubaccount;
  recipient.lookupMarketplaceSubaccount = async () =>
    recipient.extractSubaccount(paystackProfile({ code: "ACCT_TEST", domain: "test" }));
  try {
    await withEnv(
      {
        PAYSTACK_MODE: "live",
        PAYSTACK_SECRET_KEY: "sk_live_unit_not_a_real_key",
        PAYSTACK_PUBLIC_KEY: "pk_live_unit_not_a_real_key",
        ENABLED_PAYMENT_PROVIDERS: "paystack",
      },
      async () => {
        await assert.rejects(
          () => paystack.createCheckout(laborIntent("DEPOSIT"), customer()),
          (err) => err.code === "PAYSTACK_RECIPIENT_REQUIRED" || /recipient is not configured/i.test(err.message)
        );
      }
    );
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
  }
}

async function testMatchingDomainCheckoutKeepsSplit() {
  const originalLookup = recipient.lookupMarketplaceSubaccount;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/transaction/initialize") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { authorization_url: "https://checkout.paystack.com/e1", access_code: "acs" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  recipient.lookupMarketplaceSubaccount = async () =>
    recipient.extractSubaccount(paystackProfile({ code: "ACCT_TEST", domain: "test" }));
  try {
    await withEnv(
      {
        PAYSTACK_MODE: "test",
        PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
        PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
        ENABLED_PAYMENT_PROVIDERS: "paystack",
      },
      async () => {
        await paystack.createCheckout(laborIntent("DEPOSIT"), customer());
        const body = fetchMock.calls[0].body;
        assert.strictEqual(body.subaccount, "ACCT_TEST");
        assert.strictEqual(body.bearer, "subaccount");
        assert.strictEqual(body.metadata.paymentLabel, "Service Deposit - First 50%");
        assert.ok(!Object.prototype.hasOwnProperty.call(body, "transaction_charge"));
        assertNoSensitiveMetadata(body);
      }
    );
  } finally {
    recipient.lookupMarketplaceSubaccount = originalLookup;
    fetchMock.restore();
  }
}

async function main() {
  testRequiredDomainFromModeNotNodeEnv();
  test1TestRecipientAcceptedInTestMode();
  test2TestRecipientRejectedInLiveMode();
  test3LiveRecipientAcceptedInLiveMode();
  test4LiveRecipientRejectedInTestMode();
  test5MissingDomainFailsClosed();
  test6DomainMismatchRegistrationCreatesNotPuts();
  await test6DomainMismatchRegisterHttp();
  test7LiveModeRejectsTestSecret();
  test8TestModeRejectsLiveSecret();
  test9PaystackDisabledIgnoresInvalidCredentials();
  test10DepositMetadata();
  test11CompletionMetadata();
  test12MaterialsMetadata();
  test13DeliveryMetadata();
  test14ProviderRefundRepaymentUnsplit();
  test15MetadataContainsNoSensitiveBankingFields();
  await test16PayfastUnchanged();
  await test17SplitEconomicsNoSecondTransfer();
  await testCheckoutLookupRejectsCrossDomainRecipient();
  await testMatchingDomainCheckoutKeepsSplit();
  console.log("paystack.e1.cutover.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");
runTestMain(main);
