/**
 * Refund repayment duplicate-prevention tests.
 * Run: node tests/refundRepayment.test.js
 * DB integration only runs when DATABASE_URL is set.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const AppError = require("../src/utils/AppError");

async function createFixtures(prisma, suffix) {
  const providerUser = await prisma.user.create({
    data: {
      email: `repay-prov-${suffix}@example.com`,
      password: "hash",
      name: "Repay Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: { userId: providerUser.id, approved: true },
  });
  const customerUser = await prisma.user.create({
    data: {
      email: `repay-cust-${suffix}@example.com`,
      password: "hash",
      name: "Repay Customer",
      role: "CUSTOMER",
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: `repay-admin-${suffix}@example.com`,
      password: "hash",
      name: "Repay Admin",
      role: "ADMIN",
    },
  });
  const ref = `EFX-TEST-${suffix}`;
  await prisma.refundRecovery.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      customerId: customerUser.id,
      totalPending: 1000,
      recoveredAmount: 0,
      status: "PENDING",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reference: ref,
    },
  });
  await prisma.earning.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      amount: 1000,
      type: "debit",
      status: "refund_debt",
    },
  });
  return { providerUser, provider, customerUser, adminUser, ref };
}

async function cleanupFixtures(prisma, fixtures) {
  if (!fixtures) return;
  await prisma.providerRefundRepayment
    .deleteMany({ where: { providerId: fixtures.provider.id } })
    .catch(() => {});
  await prisma.refundRecovery
    .deleteMany({ where: { providerId: fixtures.provider.id } })
    .catch(() => {});
  await prisma.earning.deleteMany({ where: { providerId: fixtures.provider.id } }).catch(() => {});
  await prisma.provider.delete({ where: { id: fixtures.provider.id } }).catch(() => {});
  await prisma.user
    .deleteMany({
      where: {
        id: { in: [fixtures.providerUser.id, fixtures.customerUser.id, fixtures.adminUser.id] },
      },
    })
    .catch(() => {});
}

async function testDuplicateBlock(refundRecovery, fixtures) {
  const { providerUser, provider, ref } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: 100,
    reference: ref,
  });
  assert.strictEqual(row.status, "SUBMITTED");

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.ok(summary.pendingRepayment, "debt summary should include pending repayment");
  assert.strictEqual(summary.pendingRepayment.amount, 100);
  assert.strictEqual(summary.lastRejectedRepayment, null);

  let threw = false;
  try {
    await refundRecovery.submitProviderRepayment(providerUser.id, {
      amount: 200,
      reference: ref,
    });
  } catch (e) {
    threw = e instanceof AppError && e.statusCode === 409;
  }
  assert.strictEqual(threw, true, "second submit while pending should return 409");

  const count = await require("../src/config/prisma").providerRefundRepayment.count({
    where: { providerId: provider.id, status: "SUBMITTED" },
  });
  assert.strictEqual(count, 1, "only one SUBMITTED repayment per provider");
}

async function testRejectAllowsResubmit(refundRecovery, fixtures) {
  const { providerUser, provider, adminUser, ref } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: 150,
    reference: ref,
  });

  await refundRecovery.rejectAdminRefundRepayment(adminUser.id, row.id, {
    adminNote: "Payment not verified",
  });

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.strictEqual(summary.pendingRepayment, null);
  assert.ok(summary.lastRejectedRepayment);
  assert.strictEqual(summary.lastRejectedRepayment.amount, 150);

  const row2 = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: 150,
    reference: ref,
  });
  assert.strictEqual(row2.status, "SUBMITTED");
}

async function testConfirmPartialAllowsResubmit(refundRecovery, fixtures) {
  const { providerUser, provider, adminUser, ref } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: 400,
    reference: ref,
  });

  await refundRecovery.confirmAdminRefundRepayment(adminUser.id, row.id);

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.strictEqual(summary.pendingRepayment, null);
  assert.ok(summary.totalOwed > 0, "partial confirm should leave remaining debt");

  const row2 = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: 300,
    reference: ref,
  });
  assert.strictEqual(row2.status, "SUBMITTED");
}

async function testListViews(refundRecovery, fixtures) {
  const { providerUser, provider, adminUser, ref } = fixtures;
  const prisma = require("../src/config/prisma");

  const pending = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: 50,
    reference: ref,
  });

  const rejectedRow = await prisma.providerRefundRepayment.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      amount: 25,
      reference: `${ref}-OLD`,
      status: "REJECTED",
      reviewedBy: adminUser.id,
      reviewedAt: new Date(Date.now() - 60_000),
      adminNote: "Test rejection",
    },
  });

  const confirmedRow = await prisma.providerRefundRepayment.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      amount: 75,
      reference: `${ref}-PAID`,
      status: "CONFIRMED",
      reviewedBy: adminUser.id,
      reviewedAt: new Date(),
      adminNote: "Test confirm",
    },
  });

  const reviews = await refundRecovery.listAdminRefundRepayments({ view: "reviews" });
  assert.ok(
    reviews.every((r) => r.status === "SUBMITTED"),
    "reviews view should only return SUBMITTED"
  );
  assert.ok(
    reviews.some((r) => r.id === pending.id),
    "reviews view should include pending submission"
  );
  assert.ok(
    !reviews.some((r) => r.id === rejectedRow.id || r.id === confirmedRow.id),
    "reviews view should exclude history rows"
  );

  const history = await refundRecovery.listAdminRefundRepayments({ view: "history" });
  assert.ok(
    history.every((r) => r.status === "CONFIRMED" || r.status === "REJECTED"),
    "history view should only return CONFIRMED or REJECTED"
  );
  assert.ok(
    history.some((r) => r.id === rejectedRow.id),
    "history view should include rejected row"
  );
  assert.ok(
    history.some((r) => r.id === confirmedRow.id),
    "history view should include confirmed row"
  );
  assert.ok(
    !history.some((r) => r.id === pending.id),
    "history view should exclude pending submission"
  );

  if (history.length >= 2 && history[0].reviewedAt && history[1].reviewedAt) {
    const a = new Date(history[0].reviewedAt).getTime();
    const b = new Date(history[1].reviewedAt).getTime();
    assert.ok(a >= b, "history should be ordered by reviewedAt desc");
  }

  const confirmedOnly = await refundRecovery.listAdminRefundRepayments({
    view: "history",
    status: "CONFIRMED",
  });
  assert.ok(
    confirmedOnly.every((r) => r.status === "CONFIRMED"),
    "history status filter should narrow to CONFIRMED"
  );

  const searchHistory = await refundRecovery.listAdminRefundRepayments({
    view: "history",
    search: "PAID",
  });
  assert.ok(
    searchHistory.some((r) => r.id === confirmedRow.id),
    "search should work on history view"
  );
  assert.ok(
    !searchHistory.some((r) => r.id === rejectedRow.id),
    "search should filter history results"
  );
}

async function runDbIntegrationTests() {
  const prisma = require("../src/config/prisma");
  const refundRecovery = require("../src/services/refundRecovery.service");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fixtures1 = await createFixtures(prisma, `${suffix}-dup`);
  try {
    await testDuplicateBlock(refundRecovery, fixtures1);
  } finally {
    await cleanupFixtures(prisma, fixtures1);
  }

  const fixtures2 = await createFixtures(prisma, `${suffix}-rej`);
  try {
    await testRejectAllowsResubmit(refundRecovery, fixtures2);
  } finally {
    await cleanupFixtures(prisma, fixtures2);
  }

  const fixtures3 = await createFixtures(prisma, `${suffix}-conf`);
  try {
    await testConfirmPartialAllowsResubmit(refundRecovery, fixtures3);
  } finally {
    await cleanupFixtures(prisma, fixtures3);
  }

  const fixtures4 = await createFixtures(prisma, `${suffix}-list`);
  try {
    await testListViews(refundRecovery, fixtures4);
  } finally {
    await cleanupFixtures(prisma, fixtures4);
  }

  console.log("refundRepayment.test.js: OK (DB integration)");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("refundRepayment.test.js: skipped (no DATABASE_URL)");
    return;
  }
  await runDbIntegrationTests();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
