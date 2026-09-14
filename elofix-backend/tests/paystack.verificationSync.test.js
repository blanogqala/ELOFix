/**
 * E3 hotfix — Paystack payout-destination verification status reconciliation.
 * Run: node tests/paystack.verificationSync.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const assert = require("assert");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const payoutDestinationService = require("../src/services/payoutDestination.service");
const paystack = require("../src/services/payments/paystack.gateway");
const providerAccountService = require("../src/services/providerAccount.service");
const branchAccountService = require("../src/services/branchAccount.service");

function hasDb() {
  const url = String(process.env.DATABASE_URL || "");
  return Boolean(url) && !url.includes("placeholder");
}

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
  return Promise.resolve()
    .then(() => fn())
    .finally(restore);
}

function livePaystackEnv() {
  return {
    MARKETPLACE_SETTLEMENT_ENABLED: "true",
    ENABLED_PAYMENT_PROVIDERS: "paystack",
    PAYSTACK_MODE: "live",
    PAYSTACK_SECRET_KEY: "sk_live_unit_not_a_real_key",
    PAYSTACK_PUBLIC_KEY: "pk_live_unit_not_a_real_key",
  };
}

function testPaystackEnv() {
  return {
    MARKETPLACE_SETTLEMENT_ENABLED: "true",
    ENABLED_PAYMENT_PROVIDERS: "paystack",
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
    PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
  };
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

function assertGetOnlySubaccount(calls) {
  const subaccountCalls = calls.filter((c) => String(c.url || "").includes("/subaccount"));
  assert.ok(subaccountCalls.length >= 1, "expected GET /subaccount/:code");
  for (const call of subaccountCalls) {
    assert.strictEqual(call.method, "GET", `status refresh must not ${call.method} ${call.url}`);
    assert.ok(!String(call.url).endsWith("/subaccount"), "must not POST /subaccount");
  }
  assert.strictEqual(
    calls.filter((c) => c.method === "POST" && String(c.url).includes("/subaccount")).length,
    0
  );
  assert.strictEqual(
    calls.filter((c) => c.method === "PUT" && String(c.url).includes("/subaccount")).length,
    0
  );
}

function assertSafePublicProfile(profile) {
  assert.ok(profile);
  const raw = JSON.stringify(profile);
  assert.ok(!raw.includes("1234567890"), "raw account number must not leak");
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "accountNumber"));
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "branchCode"));
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "gatewayRecipientId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "gatewayProfilePayload"));
  assert.doesNotMatch(raw, /sk_live_/);
  assert.doesNotMatch(raw, /Bearer /);
}

async function seedProvider(suffix, extra = {}) {
  const user = await prisma.user.create({
    data: {
      email: `vsync.prov.${suffix}@example.com`,
      password: "x",
      name: "Sync Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: user.id,
      businessName: `Sync Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const profile = await prisma.providerWithdrawalProfile.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      bankName: "FNB",
      accountHolder: "Sync Provider",
      accountNumber: "enc:test-1234567890",
      branchCode: "enc:test-250655",
      accountType: "CHEQUE",
      verificationStatus: extra.verificationStatus || "PENDING_VERIFICATION",
      isActive: true,
      gatewayProvider: extra.gatewayProvider || "PAYSTACK",
      gatewayRecipientId: extra.gatewayRecipientId || "ACCT_LIVE_EXISTING",
      gatewayProfileStatus: extra.gatewayProfileStatus || "PENDING",
      gatewayProfilePayload: extra.gatewayProfilePayload || {
        domain: "live",
        subaccount_code: extra.gatewayRecipientId || "ACCT_LIVE_EXISTING",
        percentage_charge: 7,
        is_verified: false,
        active: true,
        paystackBankCode: "001",
        bank_code: "001",
      },
    },
  });
  return { user, provider, profile };
}

async function seedBranch(suffix, extra = {}) {
  const supplierUser = await prisma.user.create({
    data: {
      email: `vsync.sup.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: supplierUser.id,
      name: `Supplier ${suffix}`,
      businessName: `Biz ${suffix}`,
    },
  });
  const branch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `Branch ${suffix}`,
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
      accountNumber: "enc:test-1234567890",
      branchCode: "enc:test-250655",
      accountType: "CHEQUE",
      verificationStatus: extra.verificationStatus || "PENDING_VERIFICATION",
      isActive: true,
      gatewayProvider: extra.gatewayProvider || "PAYSTACK",
      gatewayRecipientId: extra.gatewayRecipientId || "ACCT_LIVE_BRANCH",
      gatewayProfileStatus: extra.gatewayProfileStatus || "PENDING",
      gatewayProfilePayload: extra.gatewayProfilePayload || {
        domain: "live",
        subaccount_code: extra.gatewayRecipientId || "ACCT_LIVE_BRANCH",
        percentage_charge: 7,
        is_verified: false,
        active: true,
        paystackBankCode: "001",
        bank_code: "001",
      },
    },
  });
  return {
    supplierUser,
    supplier,
    branch,
    profile,
    reqUser: { userId: supplierUser.id, role: "SUPPLIER" },
  };
}

async function cleanupProvider(fix) {
  if (!fix) return;
  if (fix.provider?.id) {
    await prisma.providerWithdrawalProfile.deleteMany({ where: { providerId: fix.provider.id } }).catch(() => {});
    await prisma.provider.delete({ where: { id: fix.provider.id } }).catch(() => {});
  }
  if (fix.user?.id) await prisma.user.delete({ where: { id: fix.user.id } }).catch(() => {});
}

async function cleanupBranch(fix) {
  if (!fix) return;
  if (fix.profile?.id) {
    await prisma.branchWithdrawalProfile.delete({ where: { id: fix.profile.id } }).catch(() => {});
  }
  if (fix.branch?.id) await prisma.branch.delete({ where: { id: fix.branch.id } }).catch(() => {});
  if (fix.supplier?.id) await prisma.supplier.delete({ where: { id: fix.supplier.id } }).catch(() => {});
  if (fix.supplierUser?.id) await prisma.user.delete({ where: { id: fix.supplierUser.id } }).catch(() => {});
}

function verifiedSubaccount(code, extras = {}) {
  return jsonResponse({
    status: true,
    data: {
      subaccount_code: code,
      percentage_charge: 7,
      active: extras.active !== false,
      is_verified: extras.is_verified !== false,
      domain: extras.domain || "live",
      paystackBankCode: extras.paystackBankCode || "001",
      bank_code: extras.bank_code || "001",
    },
  });
}

function testMappingHelpers() {
  assert.deepStrictEqual(payoutDestinationService.mapRefreshedGatewayStatus("VERIFIED"), {
    verificationStatus: "VERIFIED",
    gatewayProfileStatus: "VERIFIED",
  });
  assert.deepStrictEqual(payoutDestinationService.mapRefreshedGatewayStatus("PENDING"), {
    verificationStatus: "PENDING_VERIFICATION",
    gatewayProfileStatus: "PENDING",
  });
  const deactivated = payoutDestinationService.mapRefreshedGatewayStatus("DEACTIVATED");
  assert.strictEqual(deactivated.gatewayProfileStatus, "DEACTIVATED");
  assert.strictEqual(deactivated.claimVerified, false);
  assert.notStrictEqual(deactivated.verificationStatus, "VERIFIED");

  const merged = payoutDestinationService.mergeSafeGatewayProfilePayload(
    {
      domain: "live",
      subaccount_code: "ACCT_KEEP",
      percentage_charge: 7,
      is_verified: false,
      active: true,
      paystackBankCode: "001",
      bank_code: "001",
      extraSafe: "keep-me",
    },
    {
      domain: "test",
      is_verified: true,
      active: true,
      account_number: "1234567890",
    }
  );
  assert.strictEqual(merged.domain, "live", "must never relabel stored domain");
  assert.strictEqual(merged.subaccount_code, "ACCT_KEEP");
  assert.strictEqual(merged.percentage_charge, 7);
  assert.strictEqual(merged.is_verified, true);
  assert.strictEqual(merged.paystackBankCode, "001");
  assert.strictEqual(merged.extraSafe, "keep-me");
  assert.ok(!Object.prototype.hasOwnProperty.call(merged, "account_number"));
}

async function test1LivePendingBecomesVerified() {
  const code = "ACCT_LIVE_EXISTING";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t1`, { gatewayRecipientId: code });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes(`/subaccount/${encodeURIComponent(code)}`) && method === "GET") {
      return verifiedSubaccount(code);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const out = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      assert.strictEqual(out.verificationStatus, "VERIFIED");
      assert.strictEqual(out.gatewayProfileStatus, "VERIFIED");
      assert.strictEqual(out.gatewayRecipientId, code);
      assert.strictEqual(out.refreshed, true);
      assertGetOnlySubaccount(fetchMock.calls);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.verificationStatus, "VERIFIED");
    assert.strictEqual(fresh.gatewayProfileStatus, "VERIFIED");
    assert.strictEqual(fresh.gatewayRecipientId, code);
    assert.strictEqual(fresh.gatewayProfilePayload?.domain, "live");
    assert.strictEqual(fresh.gatewayProfilePayload?.is_verified, true);
    assert.strictEqual(fresh.gatewayProfilePayload?.percentage_charge, 7);
    assert.strictEqual(fresh.gatewayProfilePayload?.paystackBankCode, "001");
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test2VerifiedRefreshIsIdempotent() {
  const code = "ACCT_LIVE_EXISTING";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t2`, {
    gatewayRecipientId: code,
    verificationStatus: "VERIFIED",
    gatewayProfileStatus: "VERIFIED",
    gatewayProfilePayload: {
      domain: "live",
      subaccount_code: code,
      percentage_charge: 7,
      is_verified: true,
      active: true,
      paystackBankCode: "001",
      bank_code: "001",
    },
  });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes(`/subaccount/${encodeURIComponent(code)}`) && method === "GET") {
      return verifiedSubaccount(code);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const first = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      const second = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      assert.strictEqual(first.verificationStatus, "VERIFIED");
      assert.strictEqual(second.verificationStatus, "VERIFIED");
      assert.strictEqual(first.gatewayRecipientId, code);
      assert.strictEqual(second.gatewayRecipientId, code);
      assertGetOnlySubaccount(fetchMock.calls);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.gatewayRecipientId, code);
    assert.strictEqual(fresh.verificationStatus, "VERIFIED");
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test3PaystackStillUnverified() {
  const code = "ACCT_LIVE_EXISTING";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t3`, { gatewayRecipientId: code });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes(`/subaccount/${encodeURIComponent(code)}`) && method === "GET") {
      return verifiedSubaccount(code, { is_verified: false });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const out = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      assert.strictEqual(out.verificationStatus, "PENDING_VERIFICATION");
      assert.strictEqual(out.gatewayProfileStatus, "PENDING");
      assert.strictEqual(out.gatewayRecipientId, code);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.verificationStatus, "PENDING_VERIFICATION");
    assert.strictEqual(fresh.gatewayRecipientId, code);
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test4LookupFailureDoesNotDowngradeVerified() {
  const code = "ACCT_LIVE_EXISTING";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t4`, {
    gatewayRecipientId: code,
    verificationStatus: "VERIFIED",
    gatewayProfileStatus: "VERIFIED",
    gatewayProfilePayload: {
      domain: "live",
      subaccount_code: code,
      percentage_charge: 7,
      is_verified: true,
      active: true,
      paystackBankCode: "001",
    },
  });
  const fetchMock = installFetchMock(() => {
    throw new Error("paystack_temporarily_unavailable");
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const out = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      assert.strictEqual(out.verificationStatus, "VERIFIED");
      assert.strictEqual(out.gatewayProfileStatus, "VERIFIED");
      assert.strictEqual(out.refreshed, false);
      assert.ok(out.refreshError);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.verificationStatus, "VERIFIED");
    assert.strictEqual(fresh.gatewayProfileStatus, "VERIFIED");
    assert.strictEqual(fresh.gatewayRecipientId, code);
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test5TestDomainFailClosedInLiveMode() {
  const code = "ACCT_TEST_FOREIGN";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t5`, {
    gatewayRecipientId: code,
    gatewayProfilePayload: { domain: "test", subaccount_code: code, percentage_charge: 7 },
  });
  const fetchMock = installFetchMock(() => {
    throw new Error("must not query TEST recipient in LIVE mode");
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const out = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      assert.strictEqual(out.refreshed, false);
      assert.strictEqual(out.queried, false);
      assert.strictEqual(out.refreshError, "paystack_recipient_not_usable_in_current_mode");
      assert.strictEqual(out.verificationStatus, "PENDING_VERIFICATION");
      assert.strictEqual(fetchMock.calls.length, 0);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.gatewayRecipientId, code);
    assert.strictEqual(fresh.gatewayProfilePayload?.domain, "test");
    assert.notStrictEqual(fresh.verificationStatus, "VERIFIED");
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test6LiveDomainFailClosedInTestMode() {
  const code = "ACCT_LIVE_FOREIGN";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t6`, {
    gatewayRecipientId: code,
    gatewayProfilePayload: { domain: "live", subaccount_code: code, percentage_charge: 7 },
  });
  const fetchMock = installFetchMock(() => {
    throw new Error("must not query LIVE recipient in TEST mode");
  });
  try {
    await withEnv(testPaystackEnv(), async () => {
      const out = await payoutDestinationService.refreshPayoutDestinationStatus({
        scope: "provider",
        entityId: fix.provider.id,
      });
      assert.strictEqual(out.refreshed, false);
      assert.strictEqual(out.queried, false);
      assert.strictEqual(out.refreshError, "paystack_recipient_not_usable_in_current_mode");
      assert.strictEqual(fetchMock.calls.length, 0);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.gatewayRecipientId, code);
    assert.strictEqual(fresh.gatewayProfilePayload?.domain, "live");
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test7ProviderProfileEndpointReturnsVerified() {
  const code = "ACCT_LIVE_EXISTING";
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}t7`, { gatewayRecipientId: code });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes(`/subaccount/${encodeURIComponent(code)}`) && method === "GET") {
      return verifiedSubaccount(code);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const out = await providerAccountService.getWithdrawalProfile(fix.user.id);
      assertSafePublicProfile(out.profile);
      assert.strictEqual(out.verificationStatus, "VERIFIED");
      assert.strictEqual(out.profile.verificationStatus, "VERIFIED");
      assert.strictEqual(out.profile.gatewaySettlementProfile.status, "VERIFIED");
      assert.strictEqual(out.profile.gatewaySettlementProfile.provider, "PAYSTACK");
      assert.strictEqual(out.profile.gatewaySettlementProfile.recipientConfigured, true);
      assertGetOnlySubaccount(fetchMock.calls);
    });
  } finally {
    fetchMock.restore();
    await cleanupProvider(fix);
  }
}

async function test8BranchStatusCanReconcileVerified() {
  const code = "ACCT_LIVE_BRANCH";
  const fix = await seedBranch(`${randomUUID().slice(0, 8)}t8`, { gatewayRecipientId: code });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes(`/subaccount/${encodeURIComponent(code)}`) && method === "GET") {
      return verifiedSubaccount(code);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const out = await branchAccountService.getWithdrawalProfile(fix.reqUser, fix.branch.id);
      assertSafePublicProfile(out.profile);
      assert.strictEqual(out.verificationStatus, "VERIFIED");
      assert.strictEqual(out.profile.gatewaySettlementProfile.status, "VERIFIED");
      assertGetOnlySubaccount(fetchMock.calls);
    });
    const fresh = await prisma.branchWithdrawalProfile.findUnique({
      where: { branchId: fix.branch.id },
    });
    assert.strictEqual(fresh.verificationStatus, "VERIFIED");
    assert.strictEqual(fresh.gatewayRecipientId, code);
  } finally {
    fetchMock.restore();
    await cleanupBranch(fix);
  }
}

async function testGatewayGetStatusUsesGetOnly() {
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/subaccount/ACCT_LIVE_EXISTING") && method === "GET") {
      return verifiedSubaccount("ACCT_LIVE_EXISTING");
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(livePaystackEnv(), async () => {
      const result = await paystack.getPayoutDestinationStatus("ACCT_LIVE_EXISTING");
      assert.strictEqual(result.status, "VERIFIED");
      assert.strictEqual(result.recipientId, "ACCT_LIVE_EXISTING");
      assert.strictEqual(result.data.is_verified, true);
      assertGetOnlySubaccount(fetchMock.calls);
    });
  } finally {
    fetchMock.restore();
  }
}

async function main() {
  testMappingHelpers();
  await testGatewayGetStatusUsesGetOnly();
  if (!hasDb()) {
    console.log("paystack.verificationSync.test.js: mapping/GET OK (skip DB)");
    return;
  }
  await test1LivePendingBecomesVerified();
  await test2VerifiedRefreshIsIdempotent();
  await test3PaystackStillUnverified();
  await test4LookupFailureDoesNotDowngradeVerified();
  await test5TestDomainFailClosedInLiveMode();
  await test6LiveDomainFailClosedInTestMode();
  await test7ProviderProfileEndpointReturnsVerified();
  await test8BranchStatusCanReconcileVerified();
  console.log("paystack.verificationSync.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");
runTestMain(main);
