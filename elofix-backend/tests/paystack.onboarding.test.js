/**
 * Phase D2 Block 3 — existing bank-profile Paystack register-gateway.
 * Run: node tests/paystack.onboarding.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const assert = require("assert");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const paystack = require("../src/services/payments/paystack.gateway");
const providerAccountService = require("../src/services/providerAccount.service");
const branchAccountService = require("../src/services/branchAccount.service");
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
  return Promise.resolve()
    .then(() => fn())
    .finally(restore);
}

function paystackEnv() {
  return {
    MARKETPLACE_SETTLEMENT_ENABLED: "true",
    ENABLED_PAYMENT_PROVIDERS: "payfast,paystack",
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: "sk_test_unit_not_a_real_key",
    PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
    PAYFAST_MERCHANT_ID: "10000100",
    PAYFAST_MERCHANT_KEY: "testkey",
    PAYFAST_MODE: "sandbox",
  };
}

function assertSafePublicProfile(profile) {
  assert.ok(profile);
  const raw = JSON.stringify(profile);
  assert.ok(!raw.includes("1234567890"), "raw account number must not leak");
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "accountNumber"));
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "branchCode"));
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "gatewayRecipientId"));
  assert.ok(!Object.prototype.hasOwnProperty.call(profile, "gatewayProfilePayload"));
}

async function seedProvider(suffix) {
  const user = await prisma.user.create({
    data: {
      email: `onb.prov.${suffix}@example.com`,
      password: "x",
      name: "Onboard Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: user.id,
      businessName: `Onboard Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const profile = await prisma.providerWithdrawalProfile.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      bankName: "FNB",
      accountHolder: "Onboard Provider",
      accountNumber: "enc:test-1234567890",
      branchCode: "enc:test-250655",
      accountType: "CHEQUE",
      verificationStatus: "PENDING_VERIFICATION",
      isActive: true,
    },
  });
  return { user, provider, profile };
}

async function seedBranch(suffix) {
  const supplierUser = await prisma.user.create({
    data: {
      email: `onb.sup.${suffix}@example.com`,
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
      verificationStatus: "PENDING_VERIFICATION",
      isActive: true,
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

async function testProviderExistingProfileRegistersPaystack() {
  const creates = [];
  const updates = [];
  const originalCreate = paystack.createPayoutDestination;
  const originalUpdate = paystack.updatePayoutDestination;
  paystack.createPayoutDestination = async (payload) => {
    creates.push(payload);
    return { supported: true, recipientId: "ACCT_PROV", status: "PENDING" };
  };
  paystack.updatePayoutDestination = async (id) => {
    updates.push(id);
    throw new Error("must create, not update, when no recipient");
  };
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}p`);
  try {
    await withEnv(paystackEnv(), async () => {
      const out = await providerAccountService.registerExistingPayoutGateway(fix.user.id);
      assertSafePublicProfile(out.profile);
      assert.strictEqual(out.profile.gatewaySettlementProfile.provider, "PAYSTACK");
      assert.strictEqual(out.profile.gatewaySettlementProfile.recipientConfigured, true);
      assert.notStrictEqual(out.verificationStatus, "VERIFIED");
      assert.strictEqual(creates.length, 1);
      assert.strictEqual(updates.length, 0);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.gatewayProvider, "PAYSTACK");
    assert.strictEqual(fresh.gatewayRecipientId, "ACCT_PROV");
    assert.notStrictEqual(fresh.verificationStatus, "VERIFIED");
  } finally {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    await cleanupProvider(fix);
  }
}

async function testBranchExistingProfileRegistersPaystack() {
  const creates = [];
  const originalCreate = paystack.createPayoutDestination;
  paystack.createPayoutDestination = async (payload) => {
    creates.push(payload);
    return { supported: true, recipientId: "ACCT_BRANCH", status: "PENDING" };
  };
  const fix = await seedBranch(`${randomUUID().slice(0, 8)}b`);
  try {
    await withEnv(paystackEnv(), async () => {
      const out = await branchAccountService.registerExistingPayoutGateway(fix.reqUser, fix.branch.id);
      assertSafePublicProfile(out.profile);
      assert.strictEqual(out.profile.gatewaySettlementProfile.provider, "PAYSTACK");
      assert.strictEqual(out.profile.gatewaySettlementProfile.recipientConfigured, true);
      assert.notStrictEqual(out.verificationStatus, "VERIFIED");
      assert.strictEqual(creates.length, 1);
    });
  } finally {
    paystack.createPayoutDestination = originalCreate;
    await cleanupBranch(fix);
  }
}

async function testForeignRecipientCreatesThenReplaces() {
  const creates = [];
  const updates = [];
  const originalCreate = paystack.createPayoutDestination;
  const originalUpdate = paystack.updatePayoutDestination;
  paystack.createPayoutDestination = async (payload) => {
    creates.push(payload);
    return { supported: true, recipientId: "ACCT_NEW", status: "PENDING" };
  };
  paystack.updatePayoutDestination = async (id) => {
    updates.push(id);
    throw new Error("must not send foreign recipient to Paystack update");
  };
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}f`);
  try {
    await prisma.providerWithdrawalProfile.update({
      where: { id: fix.profile.id },
      data: { gatewayProvider: "PAYFAST", gatewayRecipientId: "PF-FOREIGN" },
    });
    await withEnv(paystackEnv(), async () => {
      const out = await providerAccountService.registerExistingPayoutGateway(fix.user.id);
      assert.strictEqual(out.profile.gatewaySettlementProfile.provider, "PAYSTACK");
      assert.strictEqual(out.profile.gatewaySettlementProfile.recipientConfigured, true);
      assert.strictEqual(creates.length, 1);
      assert.strictEqual(updates.length, 0);
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.gatewayProvider, "PAYSTACK");
    assert.strictEqual(fresh.gatewayRecipientId, "ACCT_NEW");
  } finally {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    await cleanupProvider(fix);
  }
}

async function testRegistrationFailureLeavesPriorOwnership() {
  const originalCreate = paystack.createPayoutDestination;
  const originalUpdate = paystack.updatePayoutDestination;
  paystack.createPayoutDestination = async () => ({
    supported: false,
    message: "paystack_unavailable",
  });
  paystack.updatePayoutDestination = async () => {
    throw new Error("must not update on failed create");
  };
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}x`);
  try {
    await prisma.providerWithdrawalProfile.update({
      where: { id: fix.profile.id },
      data: { gatewayProvider: "PAYFAST", gatewayRecipientId: "PF-KEEP" },
    });
    await withEnv(paystackEnv(), async () => {
      const out = await providerAccountService.registerExistingPayoutGateway(fix.user.id);
      assert.notStrictEqual(out.profile.gatewaySettlementProfile.provider, "PAYSTACK");
    });
    const fresh = await prisma.providerWithdrawalProfile.findUnique({
      where: { providerId: fix.provider.id },
    });
    assert.strictEqual(fresh.gatewayProvider, "PAYFAST");
    assert.strictEqual(fresh.gatewayRecipientId, "PF-KEEP");
  } finally {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    await cleanupProvider(fix);
  }
}

async function testBankCodeComesFromListBanksNotBranchCode() {
  const calls = [];
  const originalCreate = paystack.createPayoutDestination;
  paystack.createPayoutDestination = async (payload) => {
    calls.push(payload);
    assert.notStrictEqual(payload.branchCode, payload.bank_code);
    return paystack.constructor
      ? { supported: true, recipientId: "ACCT_MAP", status: "PENDING" }
      : { supported: true, recipientId: "ACCT_MAP", status: "PENDING" };
  };
  const fetchPrev = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || "GET").toUpperCase();
    if (u.includes("/bank") && method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: [{ name: "First National Bank", code: "001", currency: "ZAR", country: "South Africa" }],
        }),
      };
    }
    if (u.includes("/subaccount") && method === "POST") {
      const body = opts.body ? JSON.parse(opts.body) : {};
      assert.strictEqual(body.settlement_bank, "001");
      assert.notStrictEqual(body.settlement_bank, "250655");
      assert.notStrictEqual(body.settlement_bank, "enc:test-250655");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: { subaccount_code: "ACCT_MAPPED", percentage_charge: 7, active: true, is_verified: false },
        }),
      };
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  const fix = await seedProvider(`${randomUUID().slice(0, 8)}m`);
  try {
    await withEnv(paystackEnv(), async () => {
      paystack.createPayoutDestination = originalCreate;
      const out = await providerAccountService.registerExistingPayoutGateway(fix.user.id);
      assert.strictEqual(out.profile.gatewaySettlementProfile.provider, "PAYSTACK");
      assert.strictEqual(out.profile.gatewaySettlementProfile.recipientConfigured, true);
    });
  } finally {
    paystack.createPayoutDestination = originalCreate;
    global.fetch = fetchPrev;
    await cleanupProvider(fix);
  }
}

async function testMissingProfileFailsClosed() {
  const user = await prisma.user.create({
    data: {
      email: `onb.none.${randomUUID().slice(0, 8)}@example.com`,
      password: "x",
      name: "No Profile",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: user.id,
      businessName: "No Profile Biz",
      approved: true,
      profileCompleted: true,
    },
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await assert.rejects(
        () => providerAccountService.registerExistingPayoutGateway(user.id),
        (err) => err instanceof AppError && err.statusCode === 404
      );
    });
  } finally {
    await prisma.provider.delete({ where: { id: provider.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("paystack.onboarding.test.js: skip DB (DATABASE_URL not set)");
    return;
  }
  await testProviderExistingProfileRegistersPaystack();
  await testBranchExistingProfileRegistersPaystack();
  await testForeignRecipientCreatesThenReplaces();
  await testRegistrationFailureLeavesPriorOwnership();
  await testBankCodeComesFromListBanksNotBranchCode();
  await testMissingProfileFailsClosed();
  console.log("paystack.onboarding.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");
runTestMain(main);
