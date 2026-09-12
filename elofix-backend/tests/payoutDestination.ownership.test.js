/**
 * Payout destination registration must not send a foreign gateway recipient
 * id to Paystack. Run: node tests/payoutDestination.ownership.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const prisma = require("../src/config/prisma");
const payoutDestinationService = require("../src/services/payoutDestination.service");
const paystack = require("../src/services/payments/paystack.gateway");
const payfast = require("../src/services/payments/payfast.gateway");

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

async function seedBranch(suffix) {
  const supplierUser = await prisma.user.create({
    data: {
      email: `own.sup.${suffix}@example.com`,
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
      accountNumber: "enc:test",
      accountHolder: "Branch Holder",
      branchCode: "enc:test",
      verificationStatus: "VERIFIED",
      isActive: true,
    },
  });
  return { supplierUser, supplier, branch, profile };
}

async function cleanup(fix) {
  if (!fix) return;
  if (fix.profile?.id) {
    await prisma.branchWithdrawalProfile.delete({ where: { id: fix.profile.id } }).catch(() => {});
  }
  if (fix.branch?.id) await prisma.branch.delete({ where: { id: fix.branch.id } }).catch(() => {});
  if (fix.supplier?.id) await prisma.supplier.delete({ where: { id: fix.supplier.id } }).catch(() => {});
  if (fix.supplierUser?.id) await prisma.user.delete({ where: { id: fix.supplierUser.id } }).catch(() => {});
}

function testOwnershipHelpers() {
  assert.strictEqual(
    payoutDestinationService.profileRecipientOwnedByGateway(
      { gatewayRecipientId: "ACCT_1", gatewayProvider: "PAYSTACK" },
      { name: "PAYSTACK" }
    ),
    true
  );
  assert.strictEqual(
    payoutDestinationService.profileRecipientOwnedByGateway(
      { gatewayRecipientId: "PF-RECIP", gatewayProvider: "PAYFAST" },
      { name: "PAYSTACK" }
    ),
    false
  );
  assert.strictEqual(
    payoutDestinationService.profileRecipientOwnedByGateway(
      { gatewayRecipientId: null, gatewayProvider: "PAYSTACK" },
      { name: "PAYSTACK" }
    ),
    false
  );
  const owner = payoutDestinationService.gatewayOwningStoredRecipient({
    gatewayProvider: "PAYSTACK",
    gatewayRecipientId: "ACCT_1",
  });
  assert.ok(owner);
  assert.strictEqual(owner.name, "PAYSTACK");
}

async function testForeignRecipientCreatesInsteadOfUpdate() {
  const creates = [];
  const updates = [];
  const originalCreate = paystack.createPayoutDestination;
  const originalUpdate = paystack.updatePayoutDestination;
  paystack.createPayoutDestination = async (payload) => {
    creates.push(payload);
    return { supported: true, recipientId: "ACCT_NEW", status: "VERIFIED" };
  };
  paystack.updatePayoutDestination = async (id) => {
    updates.push(id);
    throw new Error("must not update foreign recipient");
  };
  const fix = await seedBranch(`${randomUUID().slice(0, 8)}fx`);
  try {
    await prisma.branchWithdrawalProfile.update({
      where: { id: fix.profile.id },
      data: { gatewayProvider: "PAYFAST", gatewayRecipientId: "PF-FOREIGN" },
    });
    await withEnv(paystackEnv(), async () => {
      const out = await payoutDestinationService.registerPayoutDestination({
        scope: "branch",
        entityId: fix.branch.id,
      });
      assert.strictEqual(out.recipientId, "ACCT_NEW");
      assert.strictEqual(creates.length, 1);
      assert.strictEqual(updates.length, 0);
    });
    const fresh = await prisma.branchWithdrawalProfile.findUnique({
      where: { id: fix.profile.id },
    });
    assert.strictEqual(fresh.gatewayProvider, "PAYSTACK");
    assert.strictEqual(fresh.gatewayRecipientId, "ACCT_NEW");
  } finally {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    await cleanup(fix);
  }
}

async function testSameGatewayUpdates() {
  const updates = [];
  const creates = [];
  const originalCreate = paystack.createPayoutDestination;
  const originalUpdate = paystack.updatePayoutDestination;
  paystack.createPayoutDestination = async () => {
    creates.push(true);
    throw new Error("must update existing Paystack recipient");
  };
  paystack.updatePayoutDestination = async (id) => {
    updates.push(id);
    return { supported: true, recipientId: id, status: "VERIFIED" };
  };
  const fix = await seedBranch(`${randomUUID().slice(0, 8)}sm`);
  try {
    await prisma.branchWithdrawalProfile.update({
      where: { id: fix.profile.id },
      data: { gatewayProvider: "PAYSTACK", gatewayRecipientId: "ACCT_EXISTING" },
    });
    await withEnv(paystackEnv(), async () => {
      const out = await payoutDestinationService.registerPayoutDestination({
        scope: "branch",
        entityId: fix.branch.id,
      });
      assert.strictEqual(out.recipientId, "ACCT_EXISTING");
      assert.deepStrictEqual(updates, ["ACCT_EXISTING"]);
      assert.strictEqual(creates.length, 0);
    });
  } finally {
    paystack.createPayoutDestination = originalCreate;
    paystack.updatePayoutDestination = originalUpdate;
    await cleanup(fix);
  }
}

async function testDeactivateUsesOwningGateway() {
  const deactivated = [];
  const originalFast = payfast.deactivatePayoutDestination;
  const originalStack = paystack.deactivatePayoutDestination;
  payfast.deactivatePayoutDestination = async (id) => {
    deactivated.push({ gw: "PAYFAST", id });
    return { supported: true, status: "DEACTIVATED" };
  };
  paystack.deactivatePayoutDestination = async (id) => {
    deactivated.push({ gw: "PAYSTACK", id });
    throw new Error("must not deactivate PayFast recipient via Paystack");
  };
  const fix = await seedBranch(`${randomUUID().slice(0, 8)}de`);
  try {
    await prisma.branchWithdrawalProfile.update({
      where: { id: fix.profile.id },
      data: { gatewayProvider: "PAYFAST", gatewayRecipientId: "PF-RECIPIENT" },
    });
    await withEnv(paystackEnv(), async () => {
      const out = await payoutDestinationService.deactivatePayoutDestination({
        scope: "branch",
        entityId: fix.branch.id,
      });
      assert.strictEqual(out.deactivated, true);
      assert.deepStrictEqual(deactivated, [{ gw: "PAYFAST", id: "PF-RECIPIENT" }]);
    });
  } finally {
    payfast.deactivatePayoutDestination = originalFast;
    paystack.deactivatePayoutDestination = originalStack;
    await cleanup(fix);
  }
}

async function main() {
  testOwnershipHelpers();
  if (!process.env.DATABASE_URL) {
    console.log("payoutDestination.ownership.test.js: helpers OK (skip DB)");
    return;
  }
  await testForeignRecipientCreatesInsteadOfUpdate();
  await testSameGatewayUpdates();
  await testDeactivateUsesOwningGateway();
  console.log("payoutDestination.ownership.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
