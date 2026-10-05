/**
 * Completion-window restriction, pause/resume, and system completion.
 * Run: node tests/completionWindowRestriction.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const prisma = require("../src/config/prisma");
const AppError = require("../src/utils/AppError");
const obligationService = require("../src/services/customerPaymentObligation.service");
const jobService = require("../src/services/job.service");
const jobDisputeService = require("../src/services/jobDispute.service");
const disputeAdminService = require("../src/services/disputeAdmin.service");
const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const webhookService = require("../src/services/payments/webhook.service");
const { getJobMeta } = require("../src/services/jobMeta.service");
const { PAYMENT_DUE_DAYS, getPaymentDueMs } = require("../src/config/paymentDue.config");
const { splitCommission } = require("../src/services/payments/money.util");
const { recoveryDueAtFrom } = require("../src/utils/completionDeadline.util");
const {
  processCustomerPaymentObligations,
  resetObligationCursorForTests,
} = require("../src/jobs/customerPaymentObligation.job");
const paymentService = require("../src/services/payment.service");
const { checkoutLegalAcceptance } = require("./helpers/checkoutLegalAcceptance");

const DAY = 24 * 60 * 60 * 1000;

function skipIfNoDb() {
  if (!process.env.DATABASE_URL) {
    console.log("completionWindowRestriction.test.js: skip (DATABASE_URL not set)");
    return true;
  }
  return false;
}

function assertAppStatus(err, status) {
  assert.ok(err instanceof AppError, err?.message || err);
  assert.strictEqual(err.statusCode, status, err.message);
}

async function createPeople(suffix) {
  const customer = await prisma.user.create({
    data: {
      email: `cwr.cust.${suffix}@example.com`,
      password: "x",
      name: "Window Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `cwr.prov.${suffix}@example.com`,
      password: "x",
      name: "Window Provider",
      role: "PROVIDER",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `cwr.admin.${suffix}@example.com`,
      password: "x",
      name: "Window Admin",
      role: "ADMIN",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Window Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  return { customer, providerUser, provider, admin };
}

async function createJob(people, suffix, extra = {}) {
  return prisma.job.create({
    data: {
      title: `Window job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Completion window restriction test job",
      price: 1000,
      totalPrice: 1000,
      customerId: people.customer.id,
      providerId: people.providerUser.id,
      status: extra.status || "IN_PROGRESS",
      laborPaid: extra.laborPaid !== false,
      legacyEscrowV2: Boolean(extra.legacyEscrowV2),
      paymentModeSnapshot:
        extra.paymentModeSnapshot === undefined ? "TWO_PAYMENT_50_50" : extra.paymentModeSnapshot,
      quotedAmount: 1000,
      firstPaymentAmount: 500,
      secondPaymentAmount: 500,
      paymentProgress: extra.paymentProgress || "FIRST_PAID",
      paymentReleased: Boolean(extra.paymentReleased),
      escrowSecondReleaseDone: Boolean(extra.escrowSecondReleaseDone),
      isFullyReleased: Boolean(extra.isFullyReleased),
      providerAmount: extra.providerAmount != null ? extra.providerAmount : null,
      meta: {
        statusOverride: extra.statusOverride || "AWAITING_CONFIRMATION",
        confirmationDeadlineAt: extra.confirmationDeadlineAt || null,
        markedCompleteAt: extra.markedCompleteAt || null,
        chat: [],
        ...(extra.meta || {}),
      },
    },
  });
}

async function cleanup(people, jobs) {
  const jobIds = (jobs || []).filter(Boolean).map((job) => job.id);
  if (jobIds.length) {
    const disputes = await prisma.jobDispute.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
    const disputeIds = disputes.map((row) => row.id);
    if (disputeIds.length) {
      await prisma.disputeEvidence.deleteMany({ where: { disputeId: { in: disputeIds } } }).catch(() => {});
      await prisma.disputeMessage.deleteMany({ where: { disputeId: { in: disputeIds } } }).catch(() => {});
      await prisma.disputeResolutionLog.deleteMany({ where: { disputeId: { in: disputeIds } } }).catch(() => {});
      await prisma.jobDisputeRound.deleteMany({ where: { disputeId: { in: disputeIds } } }).catch(() => {});
      await prisma.jobDispute.deleteMany({ where: { id: { in: disputeIds } } }).catch(() => {});
    }
    await prisma.notification.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { entityId: { in: jobIds } } }).catch(() => {});
    await prisma.customerPaymentObligation.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.paymentWebhookEvent.deleteMany({
      where: { paymentIntent: { jobId: { in: jobIds } } },
    }).catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } }).catch(() => {});
  }
  const userIds = [people?.customer?.id, people?.providerUser?.id, people?.admin?.id].filter(Boolean);
  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  }
  if (people?.provider?.id) await prisma.provider.delete({ where: { id: people.provider.id } }).catch(() => {});
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
}

function testSharedClocksUnchanged() {
  assert.strictEqual(PAYMENT_DUE_DAYS, 30);
  if (!process.env.CUSTOMER_PAYMENT_DUE_MINUTES && !process.env.REFUND_DEBT_DUE_MINUTES) {
    assert.strictEqual(getPaymentDueMs(), 30 * DAY);
  }
  const split = splitCommission(1000);
  assert.strictEqual(Number(split.commissionAmount), 70);
  assert.strictEqual(Number(split.recipientAmount), 930);
}

async function testBeforeAndAtDay7() {
  const suffix = `d7-${Date.now()}`;
  const people = await createPeople(suffix);
  const now = new Date();
  const future = new Date(now.getTime() + 2 * DAY);
  const jobFuture = await createJob(people, `${suffix}-future`, {
    confirmationDeadlineAt: future.toISOString(),
  });
  const starts = new Date(now.getTime() - 1000);
  const recovery = recoveryDueAtFrom(starts);
  const jobDue = await createJob(people, `${suffix}-due`, {
    confirmationDeadlineAt: starts.toISOString(),
    markedCompleteAt: new Date(starts.getTime() - 7 * DAY).toISOString(),
  });
  try {
    await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: jobFuture.id,
      amount: 500,
      dueAt: recoveryDueAtFrom(future),
      restrictionStartsAt: future,
      source: "COMPLETION_WORKFLOW",
    });
    resetObligationCursorForTests();
    await processCustomerPaymentObligations({ now, customerId: people.customer.id });
    const userBefore = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(userBefore.marketplaceRestricted, false);

    await prisma.customerPaymentObligation.deleteMany({ where: { jobId: jobFuture.id } });
    const created = await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: jobDue.id,
      amount: 500,
      dueAt: recovery,
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    resetObligationCursorForTests();
    const first = await processCustomerPaymentObligations({ now, customerId: people.customer.id });
    const second = await processCustomerPaymentObligations({ now, customerId: people.customer.id });
    const row = await prisma.customerPaymentObligation.findUnique({ where: { id: created.id } });
    const user = await prisma.user.findUnique({ where: { id: people.customer.id } });
    const meta = await getJobMeta(jobDue.id);
    assert.strictEqual(user.marketplaceRestricted, true);
    assert.strictEqual(row.status, "DUE");
    assert.ok(Math.abs(new Date(row.dueAt).getTime() - recovery.getTime()) < 1000);
    assert.strictEqual(Math.round((new Date(row.dueAt) - new Date(row.restrictionStartsAt)) / DAY), 30);
    assert.notStrictEqual(meta.completionConfirmedByUser, true);
    assert.strictEqual(String(jobDue.paymentProgress), "FIRST_PAID");
    const disputes = await prisma.jobDispute.count({ where: { jobId: jobDue.id } });
    assert.strictEqual(disputes, 0);
    assert.ok(first.windowExpired >= 1);
    assert.strictEqual(second.windowExpired, 0);
    const notices = await prisma.notification.count({
      where: { jobId: jobDue.id, type: "confirmation_window_expired" },
    });
    assert.ok(notices >= 2, "customer and provider are notified once");
    const again = await prisma.notification.count({
      where: { jobId: jobDue.id, type: "confirmation_window_expired" },
    });
    assert.strictEqual(again, notices);
  } finally {
    await cleanup(people, [jobFuture, jobDue]);
  }
}

async function testRestrictedApisAndOutstandingPay() {
  const suffix = `api-${Date.now()}`;
  const people = await createPeople(suffix);
  const job = await createJob(people, suffix);
  try {
    await prisma.user.update({
      where: { id: people.customer.id },
      data: {
        marketplaceRestricted: true,
        marketplaceRestrictedAt: new Date(),
        marketplaceRestrictedReason: obligationService.MARKETPLACE_RESTRICT_REASON,
        blocked: true,
        blockedReason: "admin moderation",
        blockedAt: new Date(),
      },
    });

    await assert.rejects(() => jobService.createJob(people.customer.id, {}), (err) => {
      assertAppStatus(err, 403);
      return true;
    });
    await assert.rejects(() => jobService.createJob === jobService.createJob && require("../src/services/deliveryRequest.service").createDeliveryRequest(people.customer.id, {}), (err) => {
      assertAppStatus(err, 403);
      return true;
    });
    await assert.rejects(
      () => require("../src/services/materialOrder.service").createMaterialOrder({ userId: people.customer.id, items: [] }),
      (err) => {
        assertAppStatus(err, 403);
        return true;
      }
    );

    const readable = await jobService.getJobById(job.id);
    assert.ok(readable?.id);
    const chat = await jobService.addChatMessage(
      job.id,
      { userId: people.customer.id, role: "CUSTOMER", name: "Window Customer" },
      "Still here",
      people.customer.id,
      "CUSTOMER"
    );
    assert.ok(chat);

    await prisma.user.update({
      where: { id: people.customer.id },
      data: { blocked: false, blockedReason: null, blockedAt: null },
    });
    const dispute = await jobDisputeService.openDispute(job.id, people.customer.id, {
      comment: "Need a review before I pay.",
      requestedResolution: "PROVIDER_RETURN_FIX",
      images: [],
      videos: [],
    });
    assert.ok(dispute?.id);
    await disputeAdminService.resolveDispute(people.admin.id, dispute.id, {
      action: "CLOSE_CASE",
      notes: "reopen path for pay test",
    });

    let payError = null;
    try {
      await paymentIntentService.createPaymentIntent({
        userId: people.customer.id,
        role: "CUSTOMER",
        provider: "PAYFAST",
        kind: "LABOR",
        legalAcceptance: checkoutLegalAcceptance("LABOR"),
        jobId: job.id,
        amount: 500,
        idempotencyKey: `cwr-pay-${randomUUID()}`,
        requestHash: "cwr-pay",
        route: "POST /api/payments/intents",
      });
    } catch (err) {
      payError = err;
    }
    if (payError) {
      assert.notStrictEqual(payError.statusCode, 403, payError.message);
    }
  } finally {
    await cleanup(people, [job]);
  }
}

async function testPaymentLiftsOnlyMatchingRestriction() {
  const suffix = `pay-${Date.now()}`;
  const people = await createPeople(suffix);
  const now = new Date();
  const starts = new Date(now.getTime() - DAY);
  const jobA = await createJob(people, `${suffix}-a`, { confirmationDeadlineAt: starts.toISOString() });
  const jobB = await createJob(people, `${suffix}-b`, { confirmationDeadlineAt: starts.toISOString() });
  try {
    await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: jobA.id,
      amount: 500,
      dueAt: recoveryDueAtFrom(starts),
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: jobB.id,
      amount: 400,
      dueAt: recoveryDueAtFrom(starts),
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    await prisma.user.update({
      where: { id: people.customer.id },
      data: {
        marketplaceRestricted: true,
        marketplaceRestrictedReason: obligationService.MARKETPLACE_RESTRICT_REASON,
        blocked: true,
        blockedReason: "keep this block",
      },
    });
    await obligationService.markObligationPaidForJob(jobA.id);
    await obligationService.afterObligationPaid(people.customer.id);
    const mid = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(mid.marketplaceRestricted, true);
    assert.strictEqual(mid.blocked, true);
    assert.strictEqual(mid.blockedReason, "keep this block");

    await obligationService.markObligationPaidForJob(jobB.id);
    await obligationService.afterObligationPaid(people.customer.id);
    const done = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(done.marketplaceRestricted, false);
    assert.strictEqual(done.blocked, true);
    assert.strictEqual(done.blockedReason, "keep this block");
  } finally {
    await cleanup(people, [jobA, jobB]);
  }
}

async function testVerifiedCompletionPayment() {
  const suffix = `wh-${Date.now()}`;
  const people = await createPeople(suffix);
  const starts = new Date(Date.now() - DAY);
  const job = await createJob(people, suffix, { confirmationDeadlineAt: starts.toISOString() });
  try {
    await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: job.id,
      amount: 500,
      dueAt: recoveryDueAtFrom(starts),
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    await obligationService.applyCustomerMarketplaceRestriction(
      people.customer.id,
      obligationService.MARKETPLACE_RESTRICT_REASON
    );
    const intent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
        provider: "PAYFAST",
        kind: "LABOR",
        paymentType: "COMPLETION",
        userId: people.customer.id,
        jobId: job.id,
        amount: 500,
        currency: "ZAR",
        state: "PENDING",
        escrowStatus: "NOT_APPLICABLE",
      },
    });
    const payload = {
      valid: true,
      merchantReference: intent.merchantReference,
      gatewayTransactionId: `gw-cwr-${intent.id}`,
      state: "PAID",
      amount: 500,
      externalEventId: `cwr-comp-${intent.id}`,
      raw: { source: "completion_window_test", card_last4: "4242" },
    };
    const first = await webhookService.processWebhookResult("PAYFAST", payload);
    assert.ok(!first.httpStatus || first.httpStatus < 400, first.message || "webhook failed");
    const second = await webhookService.processWebhookResult("PAYFAST", payload);
    const paidJob = await prisma.job.findUnique({ where: { id: job.id } });
    const meta = await getJobMeta(job.id);
    const obligation = await prisma.customerPaymentObligation.findFirst({ where: { jobId: job.id } });
    const user = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(paidJob.status, "COMPLETED");
    assert.strictEqual(paidJob.paymentProgress, "FULLY_PAID");
    assert.notStrictEqual(meta.completionConfirmedByUser, true);
    assert.strictEqual(obligation.status, "PAID");
    assert.strictEqual(user.marketplaceRestricted, false);
    assert.ok(second);
    const ledgers = await prisma.commissionLedger.count({ where: { jobId: job.id } });
    assert.ok(ledgers <= 1);
  } finally {
    await cleanup(people, [job]);
  }
}

async function testDisputePauseAndResume() {
  const suffix = `disp-${Date.now()}`;
  const people = await createPeople(suffix);
  const starts = new Date("2026-03-01T00:00:00.000Z");
  const dueAt = recoveryDueAtFrom(starts);
  const otherStarts = new Date(Date.now() - DAY);
  const job = await createJob(people, suffix, {
    confirmationDeadlineAt: starts.toISOString(),
    markedCompleteAt: "2026-02-22T00:00:00.000Z",
  });
  const other = await createJob(people, `${suffix}-other`, {
    confirmationDeadlineAt: otherStarts.toISOString(),
  });
  try {
    const row = await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: job.id,
      amount: 500,
      dueAt,
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: other.id,
      amount: 250,
      dueAt: recoveryDueAtFrom(otherStarts),
      restrictionStartsAt: otherStarts,
      source: "COMPLETION_WORKFLOW",
    });
    await prisma.user.update({
      where: { id: people.customer.id },
      data: { marketplaceRestricted: true, marketplaceRestrictedReason: obligationService.MARKETPLACE_RESTRICT_REASON },
    });

    const dispute = await jobDisputeService.openDispute(job.id, people.customer.id, {
      comment: "Pause this job only.",
      requestedResolution: "PROVIDER_RETURN_FIX",
      images: [],
      videos: [],
    });
    const paused = await prisma.customerPaymentObligation.findUnique({ where: { id: row.id } });
    const user = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(paused.status, "PAUSED");
    assert.strictEqual(new Date(paused.dueAt).toISOString(), dueAt.toISOString());
    assert.strictEqual(new Date(paused.restrictionStartsAt).toISOString(), starts.toISOString());
    assert.strictEqual(user.marketplaceRestricted, true, "the other unpaid job keeps the restriction");

    await obligationService.markObligationPaidForJob(other.id);
    await obligationService.afterObligationPaid(people.customer.id);
    const cleared = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(cleared.marketplaceRestricted, false);

    await disputeAdminService.resolveDispute(people.admin.id, dispute.id, {
      action: "RELEASE_FUNDS",
      notes: "Resume original balance",
    });
    const rows = await prisma.customerPaymentObligation.findMany({ where: { jobId: job.id } });
    assert.strictEqual(rows.length, 1);
    assert.notStrictEqual(rows[0].status, "CANCELLED");
    assert.notStrictEqual(rows[0].status, "PAUSED");
    assert.strictEqual(new Date(rows[0].dueAt).toISOString(), dueAt.toISOString());
    assert.strictEqual(new Date(rows[0].restrictionStartsAt).toISOString(), starts.toISOString());
    assert.strictEqual(rows[0].source, "COMPLETION_WORKFLOW");

    await prisma.customerPaymentObligation.update({
      where: { id: rows[0].id },
      data: {
        windowExpiredNotifiedAt: new Date("2026-03-08T00:00:00.000Z"),
        overdueNotifiedAt: new Date("2026-04-07T00:00:00.000Z"),
        restrictionAppliedAt: starts,
      },
    });
    resetObligationCursorForTests();
    const again = await processCustomerPaymentObligations({
      now: new Date(),
      customerId: people.customer.id,
    });
    const restrictedAgain = await prisma.user.findUnique({ where: { id: people.customer.id } });
    assert.strictEqual(restrictedAgain.marketplaceRestricted, true);
    assert.strictEqual(again.windowExpired, 0);
    assert.strictEqual(again.overdue, 0);
    const windowNotes = await prisma.notification.count({
      where: { userId: people.customer.id, jobId: job.id, type: "confirmation_window_expired" },
    });
    assert.strictEqual(windowNotes, 0);
  } finally {
    await cleanup(people, [job, other]);
  }
}

async function testCloseCaseResumesAndReturnCancels() {
  const suffix = `close-${Date.now()}`;
  const people = await createPeople(suffix);
  const starts = new Date(Date.now() + 3 * DAY);
  const dueAt = recoveryDueAtFrom(starts);
  const job = await createJob(people, suffix, { confirmationDeadlineAt: starts.toISOString() });
  const returned = await createJob(people, `${suffix}-ret`, { confirmationDeadlineAt: starts.toISOString() });
  try {
    const row = await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: job.id,
      amount: 500,
      dueAt,
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    const dispute = await jobDisputeService.openDispute(job.id, people.customer.id, {
      comment: "Close without a new deadline.",
      requestedResolution: "OTHER",
      otherResolutionDetail: "Please just close it.",
      images: [],
      videos: [],
    });
    await disputeAdminService.resolveDispute(people.admin.id, dispute.id, {
      action: "CLOSE_CASE",
      notes: "No financial change",
    });
    const resumed = await prisma.customerPaymentObligation.findUnique({ where: { id: row.id } });
    assert.strictEqual(resumed.status, "DUE");
    assert.strictEqual(new Date(resumed.dueAt).toISOString(), dueAt.toISOString());
    const count = await prisma.customerPaymentObligation.count({ where: { jobId: job.id } });
    assert.strictEqual(count, 1);

    const retRow = await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: returned.id,
      amount: 500,
      dueAt,
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    const retDispute = await jobDisputeService.openDispute(returned.id, people.customer.id, {
      comment: "Send the provider back.",
      requestedResolution: "PROVIDER_RETURN_FIX",
      images: [],
      videos: [],
    });
    await disputeAdminService.resolveDispute(people.admin.id, retDispute.id, {
      action: "RETURN_PROVIDER",
      notes: "Work is not accepted",
    });
    const cancelled = await prisma.customerPaymentObligation.findUnique({ where: { id: retRow.id } });
    assert.strictEqual(cancelled.status, "CANCELLED");
    const revived = await obligationService.resumePausedObligation(returned.id);
    assert.strictEqual(revived, null);
    const still = await prisma.customerPaymentObligation.findUnique({ where: { id: retRow.id } });
    assert.strictEqual(still.status, "CANCELLED");
    const openRows = await prisma.customerPaymentObligation.count({
      where: { jobId: returned.id, status: { in: ["DUE", "OVERDUE", "PAUSED"] } },
    });
    assert.strictEqual(openRows, 0);
  } finally {
    await cleanup(people, [job, returned]);
  }
}

async function testDay37Once() {
  const suffix = `d37-${Date.now()}`;
  const people = await createPeople(suffix);
  const now = new Date();
  const starts = new Date(now.getTime() - 37 * DAY);
  const dueAt = new Date(now.getTime() - 1000);
  const job = await createJob(people, suffix, { confirmationDeadlineAt: starts.toISOString() });
  try {
    const row = await obligationService.upsertOpenObligation({
      customerId: people.customer.id,
      jobId: job.id,
      amount: 500,
      dueAt,
      restrictionStartsAt: starts,
      source: "COMPLETION_WORKFLOW",
    });
    await prisma.customerPaymentObligation.update({
      where: { id: row.id },
      data: { windowExpiredNotifiedAt: new Date(now.getTime() - 30 * DAY), restrictionAppliedAt: starts },
    });
    resetObligationCursorForTests();
    const first = await processCustomerPaymentObligations({ now, customerId: people.customer.id });
    const second = await processCustomerPaymentObligations({ now, customerId: people.customer.id });
    const after = await prisma.customerPaymentObligation.findUnique({ where: { id: row.id } });
    assert.strictEqual(after.status, "OVERDUE");
    assert.ok(after.overdueNotifiedAt);
    assert.ok(first.overdue >= 1);
    assert.strictEqual(second.overdue, 0);
    const adminNotes = await prisma.notification.count({
      where: { userId: people.admin.id, jobId: job.id, type: "admin_customer_payment_overdue" },
    });
    assert.strictEqual(adminNotes, 1);
  } finally {
    await cleanup(people, [job]);
  }
}

async function testUpfrontSystemCompleteAndLegacyRelease() {
  const suffix = `sys-${Date.now()}`;
  const people = await createPeople(suffix);
  const past = new Date(Date.now() - DAY).toISOString();
  const upfront = await createJob(people, `${suffix}-up`, {
    paymentModeSnapshot: "SINGLE_PAYMENT_UPFRONT",
    paymentProgress: "FULLY_PAID",
    paymentReleased: true,
    escrowSecondReleaseDone: true,
    isFullyReleased: true,
    confirmationDeadlineAt: past,
    statusOverride: "AWAITING_CONFIRMATION",
  });
  const legacy = await createJob(people, `${suffix}-leg`, {
    legacyEscrowV2: true,
    paymentModeSnapshot: null,
    paymentProgress: "FIRST_PAID",
    paymentReleased: false,
    escrowSecondReleaseDone: false,
    providerAmount: 465,
    confirmationDeadlineAt: past,
    meta: { courierFlow: false },
  });
  const originalRelease = paymentService.runSecondTrancheInTransaction;
  let releaseCalls = 0;
  paymentService.runSecondTrancheInTransaction = async (...args) => {
    releaseCalls += 1;
    return originalRelease.apply(paymentService, args);
  };
  try {
    const completed = await jobService.systemCompleteJobAfterDeadline(upfront.id);
    assert.ok(completed);
    const upfrontRow = await prisma.job.findUnique({ where: { id: upfront.id } });
    const upfrontMeta = await getJobMeta(upfront.id);
    assert.strictEqual(upfrontRow.status, "COMPLETED");
    assert.strictEqual(upfrontRow.escrowSecondReleaseDone, true);
    assert.notStrictEqual(upfrontMeta.completionConfirmedByUser, true);
    assert.ok((upfrontMeta.timelineEvents || []).some((event) => event.type === "AUTO_ACCEPTED"));
    const reviews = await prisma.providerReview.count({ where: { jobId: upfront.id } });
    assert.strictEqual(reviews, 0);
    const again = await jobService.systemCompleteJobAfterDeadline(upfront.id);
    assert.strictEqual(again, null);

    releaseCalls = 0;
    await jobService.systemCompleteJobAfterDeadline(legacy.id);
    const legacyMeta = await getJobMeta(legacy.id);
    assert.ok(releaseCalls >= 1, "legacy hold still calls the existing second-tranche release");
    assert.notStrictEqual(legacyMeta.completionConfirmedByUser, true);
  } finally {
    paymentService.runSecondTrancheInTransaction = originalRelease;
    await cleanup(people, [upfront, legacy]);
  }
}

async function testRepeatedMarkCompleteAndPagination() {
  const suffix = `page-${Date.now()}`;
  const people = await createPeople(suffix);
  const base = await createJob(people, suffix, {
    statusOverride: "IN_PROGRESS",
    confirmationDeadlineAt: null,
    paymentProgress: "FIRST_PAID",
  });
  const extra = [];
  try {
    await jobService.updateJobStatus(base.id, "AWAITING_CONFIRMATION", people.providerUser.id, "PROVIDER");
    const meta = await getJobMeta(base.id);
    const firstDeadline = meta.confirmationDeadlineAt;
    assert.ok(firstDeadline);
    await assert.rejects(
      () => jobService.updateJobStatus(base.id, "AWAITING_CONFIRMATION", people.providerUser.id, "PROVIDER"),
      (err) => err instanceof AppError
    );
    const metaAgain = await getJobMeta(base.id);
    assert.strictEqual(metaAgain.confirmationDeadlineAt, firstDeadline);
    const obligation = await prisma.customerPaymentObligation.findFirst({
      where: { jobId: base.id, status: "DUE" },
    });
    assert.ok(obligation?.restrictionStartsAt);
    assert.strictEqual(new Date(obligation.restrictionStartsAt).toISOString(), new Date(firstDeadline).toISOString());
    assert.strictEqual(
      new Date(obligation.dueAt).toISOString(),
      recoveryDueAtFrom(firstDeadline).toISOString()
    );

    for (let i = 0; i < 3; i++) {
      const job = await createJob(people, `${suffix}-${i}`, {
        confirmationDeadlineAt: new Date(Date.now() - DAY).toISOString(),
      });
      extra.push(job);
      await obligationService.upsertOpenObligation({
        customerId: people.customer.id,
        jobId: job.id,
        amount: 100 + i,
        dueAt: recoveryDueAtFrom(new Date(Date.now() - DAY)),
        restrictionStartsAt: new Date(Date.now() - DAY),
        source: "COMPLETION_WORKFLOW",
      });
    }
    resetObligationCursorForTests();
    for (let tick = 0; tick < 8; tick++) {
      await processCustomerPaymentObligations({
        batchSize: 1,
        maxBatches: 1,
        customerId: people.customer.id,
      });
    }
    const rows = await prisma.customerPaymentObligation.findMany({
      where: { jobId: { in: extra.map((job) => job.id) } },
    });
    assert.strictEqual(rows.length, 3);
    assert.ok(rows.every((row) => row.windowExpiredNotifiedAt));
    const original = await prisma.customerPaymentObligation.findFirst({ where: { jobId: base.id } });
    assert.strictEqual(new Date(original.restrictionStartsAt).toISOString(), new Date(firstDeadline).toISOString());
  } finally {
    await cleanup(people, [base, ...extra]);
  }
}

(async () => {
  testSharedClocksUnchanged();
  if (skipIfNoDb()) {
    console.log("completionWindowRestriction.test.js: unit clocks passed; integration skipped");
    return;
  }
  await testBeforeAndAtDay7();
  await testRestrictedApisAndOutstandingPay();
  await testPaymentLiftsOnlyMatchingRestriction();
  await testVerifiedCompletionPayment();
  await testDisputePauseAndResume();
  await testCloseCaseResumesAndReturnCancels();
  await testDay37Once();
  await testUpfrontSystemCompleteAndLegacyRelease();
  await testRepeatedMarkCompleteAndPagination();
  console.log("completionWindowRestriction.test.js passed");
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
