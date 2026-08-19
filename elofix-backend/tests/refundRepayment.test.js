/**
 * Refund repayment tests (amount authority, admin DTO, confirm mismatch).
 * Run: node tests/refundRepayment.test.js
 * DB integration only runs when DATABASE_URL is set.
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const AppError = require("../src/utils/AppError");

async function createFixtures(prisma, suffix, { debtAmount = 465 } = {}) {
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
  const recovery = await prisma.refundRecovery.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      customerId: customerUser.id,
      totalPending: debtAmount,
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
      amount: debtAmount,
      type: "debit",
      status: "refund_debt",
    },
  });
  return { providerUser, provider, customerUser, adminUser, ref, recovery, debtAmount };
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
  const { providerUser, provider, ref, debtAmount } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: debtAmount,
    reference: ref,
  });
  assert.strictEqual(row.status, "SUBMITTED");
  assert.strictEqual(Number(row.amount), debtAmount);

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.ok(summary.pendingRepayment, "debt summary should include pending repayment");
  assert.strictEqual(summary.pendingRepayment.amount, debtAmount);
  assert.strictEqual(summary.lastRejectedRepayment, null);

  let threw = false;
  try {
    await refundRecovery.submitProviderRepayment(providerUser.id, {
      amount: debtAmount,
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
  const { providerUser, provider, adminUser, ref, debtAmount } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: debtAmount,
    reference: ref,
  });

  await refundRecovery.rejectAdminRefundRepayment(adminUser.id, row.id, {
    adminNote: "Payment not verified",
  });

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.strictEqual(summary.pendingRepayment, null);
  assert.ok(summary.lastRejectedRepayment);
  assert.strictEqual(summary.lastRejectedRepayment.amount, debtAmount);

  const history = await refundRecovery.listAdminRefundRepayments({ view: "history" });
  assert.ok(
    history.some((r) => r.id === row.id && r.status === "REJECTED"),
    "rejected repayment remains in history"
  );

  const row2 = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: debtAmount,
    reference: ref,
  });
  assert.strictEqual(row2.status, "SUBMITTED");
}

async function testClientCannotManipulateAmount(refundRecovery, fixtures) {
  const { providerUser, ref, debtAmount } = fixtures;
  let threw = false;
  try {
    await refundRecovery.submitProviderRepayment(providerUser.id, {
      amount: roundDown(debtAmount),
      reference: ref,
    });
  } catch (e) {
    threw = e instanceof AppError && e.statusCode === 400;
    assert.ok(/must equal the outstanding obligation/i.test(e.message), e.message);
  }
  assert.strictEqual(threw, true, "understated client amount must be rejected");
}

function roundDown(n) {
  return Math.max(1, Math.round((n - 65) * 100) / 100);
}

async function testAdminListReturnsNumericAmount(refundRecovery, fixtures) {
  const { providerUser, ref, debtAmount } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: debtAmount,
    reference: ref,
  });

  const reviews = await refundRecovery.listAdminRefundRepayments({ view: "reviews" });
  const dto = reviews.find((r) => r.id === row.id);
  assert.ok(dto, "admin list should include submitted repayment");
  assert.strictEqual(typeof dto.amount, "number", "amount must be a JS number, not Decimal string");
  assert.strictEqual(typeof dto.submittedAmount, "number");
  assert.strictEqual(dto.amount, debtAmount);
  assert.strictEqual(dto.submittedAmount, debtAmount);
  assert.strictEqual(dto.expectedAmount, debtAmount);
  assert.strictEqual(dto.amountMismatch, false);
  assert.strictEqual(dto.amountMissing, false);
  assert.strictEqual(dto.currency, "ZAR");
  assert.notStrictEqual(dto.amount, 0);
}

async function testConfirmMatchingRepayment(refundRecovery, fixtures) {
  const { providerUser, provider, adminUser, ref, debtAmount } = fixtures;
  const row = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: debtAmount,
    reference: ref,
  });

  // Customer refund must not run before verification
  let blockedProcess = false;
  try {
    await refundRecovery.processAdminCustomerRefund(adminUser.id, row.id);
  } catch (e) {
    blockedProcess = e instanceof AppError && e.statusCode === 400;
    assert.ok(/must be verified/i.test(e.message), e.message);
  }
  assert.strictEqual(blockedProcess, true, "process customer refund before confirm must fail");

  const confirmed = await refundRecovery.confirmAdminRefundRepayment(adminUser.id, row.id);
  assert.ok(confirmed && confirmed.repayment, "confirm should return repayment wrapper");
  assert.ok(confirmed.customerRefund, "confirm should include customerRefund payout outcome");
  assert.strictEqual(
    confirmed.customerRefund.status,
    "NONE",
    "fixtures without a job should not invent a leftover payout"
  );

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.ok(summary.totalOwed <= 1e-6, "full confirm should clear debt");
  assert.strictEqual(summary.pendingRepayment, null);
}

async function testConfirmMismatchRequiresAck(refundRecovery, fixtures) {
  const { provider, adminUser, ref, debtAmount } = fixtures;
  const prisma = require("../src/config/prisma");

  const partialAmt = roundMoney(debtAmount - 65);
  const row = await prisma.providerRefundRepayment.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      amount: partialAmt,
      reference: `${ref}-PARTIAL`,
      status: "SUBMITTED",
    },
  });

  const reviews = await refundRecovery.listAdminRefundRepayments({ view: "reviews" });
  const dto = reviews.find((r) => r.id === row.id);
  assert.ok(dto.amountMismatch, "partial row should flag mismatch");
  assert.strictEqual(dto.submittedAmount, partialAmt);
  assert.strictEqual(dto.expectedAmount, debtAmount);

  let blocked = false;
  try {
    await refundRecovery.confirmAdminRefundRepayment(adminUser.id, row.id);
  } catch (e) {
    blocked = e instanceof AppError && e.statusCode === 400;
    assert.ok(/amount mismatch/i.test(e.message), e.message);
  }
  assert.strictEqual(blocked, true, "confirm without acknowledgePartial must fail");

  await refundRecovery.confirmAdminRefundRepayment(adminUser.id, row.id, {
    acknowledgePartial: true,
  });

  const summary = await refundRecovery.getProviderRefundDebtSummary(provider.id);
  assert.ok(summary.totalOwed > 0, "partial confirm should leave remaining debt");
  assert.ok(
    Math.abs(summary.totalOwed - (debtAmount - partialAmt)) < 0.02,
    `remaining should be ~${debtAmount - partialAmt}, got ${summary.totalOwed}`
  );
}

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function testListViews(refundRecovery, fixtures) {
  const { providerUser, provider, adminUser, ref, debtAmount } = fixtures;
  const prisma = require("../src/config/prisma");

  const pending = await refundRecovery.submitProviderRepayment(providerUser.id, {
    amount: debtAmount,
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
  const pendingDto = reviews.find((r) => r.id === pending.id);
  assert.strictEqual(typeof pendingDto.amount, "number");
  assert.strictEqual(pendingDto.amount, debtAmount);

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

  const fixtures3 = await createFixtures(prisma, `${suffix}-amt`);
  try {
    await testClientCannotManipulateAmount(refundRecovery, fixtures3);
  } finally {
    await cleanupFixtures(prisma, fixtures3);
  }

  const fixtures4 = await createFixtures(prisma, `${suffix}-list465`, { debtAmount: 465 });
  try {
    await testAdminListReturnsNumericAmount(refundRecovery, fixtures4);
  } finally {
    await cleanupFixtures(prisma, fixtures4);
  }

  const fixtures5 = await createFixtures(prisma, `${suffix}-conf`, { debtAmount: 465 });
  try {
    await testConfirmMatchingRepayment(refundRecovery, fixtures5);
  } finally {
    await cleanupFixtures(prisma, fixtures5);
  }

  const fixtures6 = await createFixtures(prisma, `${suffix}-mis`, { debtAmount: 465 });
  try {
    await testConfirmMismatchRequiresAck(refundRecovery, fixtures6);
  } finally {
    await cleanupFixtures(prisma, fixtures6);
  }

  const fixtures7 = await createFixtures(prisma, `${suffix}-views`);
  try {
    await testListViews(refundRecovery, fixtures7);
  } finally {
    await cleanupFixtures(prisma, fixtures7);
  }

  console.log("refundRepayment.test.js: OK (DB integration)");
}

async function main() {
  const refundRecovery = require("../src/services/refundRecovery.service");
  assert.strictEqual(
    refundRecovery.summarizeCustomerRefundPayoutResults([{ status: "REFUND_COMPLETED" }]),
    "REFUND_COMPLETED"
  );
  assert.strictEqual(
    refundRecovery.summarizeCustomerRefundPayoutResults([
      { status: "REFUND_COMPLETED" },
      { status: "REFUND_FAILED" },
    ]),
    "REFUND_FAILED"
  );
  assert.strictEqual(
    refundRecovery.summarizeCustomerRefundPayoutResults([
      { status: "REFUND_MANUAL_ACTION_REQUIRED" },
    ]),
    "REFUND_MANUAL_ACTION_REQUIRED"
  );
  assert.strictEqual(refundRecovery.summarizeCustomerRefundPayoutResults([]), "NONE");
  console.log("refundRepayment.test.js: summarizeCustomerRefundPayoutResults OK");

  if (!process.env.DATABASE_URL) {
    console.log("refundRepayment.test.js: skipped DB integration (no DATABASE_URL)");
    return;
  }
  await runDbIntegrationTests();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
