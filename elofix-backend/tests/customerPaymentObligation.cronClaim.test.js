/**
 * Overdue cron must not resurrect a paid or cancelled obligation.
 * Run: node tests/customerPaymentObligation.cronClaim.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const prisma = require("../src/config/prisma");
const obligationService = require("../src/services/customerPaymentObligation.service");
const notificationEvents = require("../src/services/notificationEvents.service");
const { processCustomerPaymentObligations } = require("../src/jobs/customerPaymentObligation.job");

function dueRow(overrides = {}) {
  return {
    id: "obl-1",
    amount: 500,
    jobId: "job-1",
    customerId: "cust-1",
    dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    status: "DUE",
    overdueNotifiedAt: null,
    restrictionAppliedAt: null,
    source: "COMPLETION_WORKFLOW",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

function matchesWhere(row, where) {
  if (!where) return true;
  if (where.id && row.id !== where.id) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (Object.prototype.hasOwnProperty.call(where, "overdueNotifiedAt")) {
    if (row.overdueNotifiedAt !== where.overdueNotifiedAt) return false;
  }
  return true;
}

function installHarness() {
  const snapshot = dueRow();
  const live = dueRow();
  const calls = {
    apply: 0,
    sync: 0,
    cancel: 0,
    notifyCustomer: 0,
    notifyAdmin: 0,
  };
  let payAfterClaim = false;
  let openCase = false;
  let openCaseAnswers = null;
  let openCaseCalls = 0;

  const original = {
    findMany: prisma.customerPaymentObligation.findMany,
    updateMany: prisma.customerPaymentObligation.updateMany,
    update: prisma.customerPaymentObligation.update,
    transaction: prisma.$transaction,
    isJobUnderOpenCase: obligationService.isJobUnderOpenCase,
    cancelWorkflowObligationForOpenCase: obligationService.cancelWorkflowObligationForOpenCase,
    applyCustomerMarketplaceRestriction: obligationService.applyCustomerMarketplaceRestriction,
    syncCompletionPaymentDueMeta: obligationService.syncCompletionPaymentDueMeta,
    notifyCustomerPaymentOverdue: notificationEvents.notifyCustomerPaymentOverdue,
    notifyAdminCustomerPaymentOverdue: notificationEvents.notifyAdminCustomerPaymentOverdue,
    auditCreate: prisma.auditLog.create,
  };

  function applyUpdate(where, data) {
    if (!matchesWhere(live, where)) return { count: 0 };
    Object.assign(live, data);
    return { count: 1 };
  }

  prisma.customerPaymentObligation.findMany = async () => [{ ...snapshot }];
  prisma.customerPaymentObligation.updateMany = async ({ where, data }) => applyUpdate(where, data);
  prisma.customerPaymentObligation.update = async ({ where, data }) => {
    const result = applyUpdate(where, data);
    if (result.count !== 1) {
      const err = new Error("record not found");
      err.code = "P2025";
      throw err;
    }
    return { ...live };
  };
  prisma.$transaction = async (fn) => {
    const tx = {
      customerPaymentObligation: {
        updateMany: async ({ where, data }) => {
          const result = applyUpdate(where, data);
          if (result.count === 1 && payAfterClaim) live.status = "PAID";
          return result;
        },
        update: async ({ where, data }) => {
          const result = applyUpdate(where, data);
          if (result.count !== 1) throw new Error("record not found");
          return { ...live };
        },
      },
    };
    return fn(tx);
  };

  obligationService.isJobUnderOpenCase = async () => {
    openCaseCalls += 1;
    if (Array.isArray(openCaseAnswers)) {
      const idx = Math.min(openCaseCalls - 1, openCaseAnswers.length - 1);
      return openCaseAnswers[idx];
    }
    return openCase;
  };
  prisma.auditLog.create = async () => ({ id: "audit-stub" });
  obligationService.cancelWorkflowObligationForOpenCase = async () => {
    calls.cancel += 1;
    live.status = "CANCELLED";
    return { id: live.id, status: "CANCELLED" };
  };
  obligationService.applyCustomerMarketplaceRestriction = async () => {
    calls.apply += 1;
    return true;
  };
  obligationService.syncCompletionPaymentDueMeta = async () => {
    calls.sync += 1;
  };
  notificationEvents.notifyCustomerPaymentOverdue = async () => {
    calls.notifyCustomer += 1;
  };
  notificationEvents.notifyAdminCustomerPaymentOverdue = async () => {
    calls.notifyAdmin += 1;
  };

  return {
    live,
    calls,
    setPayAfterClaim(value) {
      payAfterClaim = value;
    },
    setOpenCase(value) {
      openCase = value;
    },
    setOpenCaseAnswers(answers) {
      openCaseAnswers = answers;
    },
    setLiveStatus(status) {
      live.status = status;
    },
    restore() {
      prisma.customerPaymentObligation.findMany = original.findMany;
      prisma.customerPaymentObligation.updateMany = original.updateMany;
      prisma.customerPaymentObligation.update = original.update;
      prisma.$transaction = original.transaction;
      obligationService.isJobUnderOpenCase = original.isJobUnderOpenCase;
      obligationService.cancelWorkflowObligationForOpenCase = original.cancelWorkflowObligationForOpenCase;
      obligationService.applyCustomerMarketplaceRestriction = original.applyCustomerMarketplaceRestriction;
      obligationService.syncCompletionPaymentDueMeta = original.syncCompletionPaymentDueMeta;
      notificationEvents.notifyCustomerPaymentOverdue = original.notifyCustomerPaymentOverdue;
      notificationEvents.notifyAdminCustomerPaymentOverdue = original.notifyAdminCustomerPaymentOverdue;
      prisma.auditLog.create = original.auditCreate;
    },
  };
}

async function testPaidBeforeClaimIsNotRevived() {
  const harness = installHarness();
  try {
    harness.setLiveStatus("PAID");
    const stats = await processCustomerPaymentObligations();
    assert.strictEqual(harness.live.status, "PAID");
    assert.strictEqual(harness.calls.apply, 0);
    assert.strictEqual(harness.calls.sync, 0);
    assert.strictEqual(harness.calls.notifyCustomer, 0);
    assert.strictEqual(stats.overdue, 0);
    assert.strictEqual(stats.errors, 0);
  } finally {
    harness.restore();
  }
}

async function testPaidAfterClaimIsNotRevived() {
  const harness = installHarness();
  try {
    harness.setPayAfterClaim(true);
    const stats = await processCustomerPaymentObligations();
    assert.strictEqual(harness.live.status, "PAID");
    assert.strictEqual(harness.calls.notifyCustomer, 0);
    assert.strictEqual(harness.calls.notifyAdmin, 0);
    assert.strictEqual(stats.overdue, 0);
    assert.strictEqual(stats.errors, 0);
  } finally {
    harness.restore();
  }
}

async function testOpenCaseCancelsInsteadOfOverdue() {
  const harness = installHarness();
  try {
    harness.setOpenCase(true);
    const stats = await processCustomerPaymentObligations();
    assert.strictEqual(harness.live.status, "CANCELLED");
    assert.ok(harness.calls.cancel >= 1);
    assert.strictEqual(harness.calls.apply, 0);
    assert.strictEqual(harness.calls.notifyCustomer, 0);
    assert.strictEqual(stats.overdue, 0);
    assert.strictEqual(stats.errors, 0);
  } finally {
    harness.restore();
  }
}

async function testCaseOpenedAfterBatchLoadCancelsInsideTransaction() {
  const harness = installHarness();
  try {
    harness.setOpenCaseAnswers([false, true]);
    const stats = await processCustomerPaymentObligations();
    assert.strictEqual(harness.live.status, "CANCELLED");
    assert.strictEqual(harness.calls.cancel, 1);
    assert.strictEqual(harness.calls.apply, 0);
    assert.strictEqual(harness.calls.sync, 0);
    assert.strictEqual(harness.calls.notifyCustomer, 0);
    assert.strictEqual(stats.overdue, 0);
    assert.strictEqual(stats.errors, 0);
  } finally {
    harness.restore();
  }
}

async function testStillOpenRowBecomesOverdueOnce() {
  const harness = installHarness();
  try {
    const stats = await processCustomerPaymentObligations();
    assert.strictEqual(harness.live.status, "OVERDUE");
    assert.ok(harness.live.overdueNotifiedAt instanceof Date);
    assert.ok(harness.live.restrictionAppliedAt instanceof Date);
    assert.strictEqual(harness.calls.apply, 1);
    assert.strictEqual(harness.calls.sync, 1);
    assert.strictEqual(harness.calls.notifyCustomer, 1);
    assert.strictEqual(harness.calls.notifyAdmin, 1);
    assert.strictEqual(stats.overdue, 1);
    assert.strictEqual(stats.errors, 0);
  } finally {
    harness.restore();
  }
}

(async () => {
  await testPaidBeforeClaimIsNotRevived();
  await testPaidAfterClaimIsNotRevived();
  await testOpenCaseCancelsInsteadOfOverdue();
  await testCaseOpenedAfterBatchLoadCancelsInsideTransaction();
  await testStillOpenRowBecomesOverdueOnce();
  console.log("customerPaymentObligation.cronClaim.test.js passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  try {
    const { shutdownTestResources } = require("./helpers/shutdown");
    await shutdownTestResources();
  } catch {
    /* pool-close races must not fail a passed test */
  }
  process.exit(process.exitCode || 0);
});
