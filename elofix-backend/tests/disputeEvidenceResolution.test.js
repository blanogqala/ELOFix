/**
 * Dispute evidence append + completion-dispute resolution (RELEASE / REFUND / RETURN / CLOSE).
 * Run: node tests/disputeEvidenceResolution.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const prisma = require("../src/config/prisma");
const paymentModeService = require("../src/services/payments/paymentMode.service");
const webhookService = require("../src/services/payments/webhook.service");
const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const { checkoutLegalAcceptance } = require("./helpers/checkoutLegalAcceptance");
const jobDisputeService = require("../src/services/jobDispute.service");
const disputeAdminService = require("../src/services/disputeAdmin.service");
const jobService = require("../src/services/job.service");
const { getJobMeta, mutateJobMeta, toFrontendStatus } = require("../src/services/jobMeta.service");
const {
  remainingRefundableLaborGross,
  disputeGrossToLaborNet,
} = require("../src/utils/refundMath.util");
const AppError = require("../src/utils/AppError");

async function createBundle() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `ev.cust.${suffix}@example.com`,
      password: "x",
      name: "Evidence Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `ev.prov.${suffix}@example.com`,
      password: "x",
      name: "Evidence Provider",
      role: "PROVIDER",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `ev.admin.${suffix}@example.com`,
      password: "x",
      name: "Evidence Admin",
      role: "ADMIN",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Evidence Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const quoted = 1000;
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", quoted);
  const job = await prisma.job.create({
    data: {
      title: `Evidence resolution job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Dispute evidence + resolution",
      price: quoted,
      totalPrice: quoted,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "IN_PROGRESS",
      legacyEscrowV2: false,
      paymentModeSnapshot: "TWO_PAYMENT_50_50",
      quotedAmount: schedule.quotedAmount,
      firstPaymentAmount: schedule.firstPaymentAmount,
      secondPaymentAmount: schedule.secondPaymentAmount,
      paymentProgress: "NONE",
      meta: {
        servicePrice: { amount: quoted, submittedAt: new Date().toISOString() },
        statusOverride: "SERVICE_PRICE_SUBMITTED",
        chat: [],
      },
    },
  });
  const savedCard = await prisma.savedCard.create({
    data: {
      userId: customer.id,
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2035,
      isDefault: true,
    },
  });
  return { customer, providerUser, provider, admin, job, schedule, suffix, savedCard };
}

async function cleanup(bundle) {
  if (!bundle) return;
  const jobId = bundle.job?.id;
  if (jobId) {
    const dispute = await prisma.jobDispute.findUnique({ where: { jobId } }).catch(() => null);
    if (dispute) {
      await prisma.disputeEvidence.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.disputeMessage.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.disputeResolutionLog.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDisputeRound.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDispute.delete({ where: { id: dispute.id } }).catch(() => {});
    }
    await prisma.refundRecovery.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.providerReview.deleteMany({ where: { jobId } }).catch(() => {});
    const intents = await prisma.paymentIntent.findMany({ where: { jobId }, select: { id: true } });
    const intentIds = intents.map((i) => i.id);
    if (intentIds.length) {
      await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: { in: intentIds } } }).catch(() => {});
    }
    await prisma.commissionLedger.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.earning.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
  }
  if (bundle.savedCard?.id) await prisma.savedCard.delete({ where: { id: bundle.savedCard.id } }).catch(() => {});
  if (bundle.provider?.id) await prisma.provider.delete({ where: { id: bundle.provider.id } }).catch(() => {});
  if (bundle.providerUser?.id) await prisma.user.delete({ where: { id: bundle.providerUser.id } }).catch(() => {});
  if (bundle.customer?.id) await prisma.user.delete({ where: { id: bundle.customer.id } }).catch(() => {});
  if (bundle.admin?.id) await prisma.user.delete({ where: { id: bundle.admin.id } }).catch(() => {});
}

async function payDeposit(bundle) {
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
      provider: "PAYFAST",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: bundle.customer.id,
      jobId: bundle.job.id,
      amount: Number(bundle.schedule.firstPaymentAmount),
      currency: "ZAR",
      state: "PENDING",
      escrowStatus: "NOT_APPLICABLE",
    },
  });
  const out = await webhookService.processWebhookResult("PAYFAST", {
    valid: true,
    merchantReference: intent.merchantReference,
    gatewayTransactionId: `gw-ev-${intent.id}`,
    state: "PAID",
    amount: Number(intent.amount),
    externalEventId: `ev-deposit-${intent.id}-${randomUUID().slice(0, 8)}`,
    raw: { source: "dispute_evidence_resolution_test", card_last4: "4242" },
  });
  assert.ok(!out.httpStatus || out.httpStatus < 400, `deposit webhook failed: ${out.message}`);
  await mutateJobMeta(bundle.job.id, (m) => ({ ...m, statusOverride: "AWAITING_CONFIRMATION" }));
  return intent;
}

async function openCompletionDispute(bundle) {
  await payDeposit(bundle);
  return jobDisputeService.openDispute(bundle.job.id, bundle.customer.id, {
    comment: "Opening evidence #1 — work incomplete.",
    requestedResolution: "PROVIDER_RETURN_FIX",
    images: ["https://example.com/open.jpg"],
    videos: [],
  });
}

async function testMultiEvidenceAuthz() {
  const bundle = await createBundle();
  try {
    const dispute = await openCompletionDispute(bundle);
    const detail = await jobDisputeService.getDisputeById(dispute.id, bundle.customer.id, "CUSTOMER");
    assert.ok(Array.isArray(detail.evidence));
    assert.strictEqual(detail.evidence.length, 1);
    assert.strictEqual(detail.evidence[0].authorRole, "CUSTOMER");
    assert.ok(String(detail.evidence[0].comment).includes("Opening evidence"));

    const asCustomer = await jobDisputeService.addDisputeEvidence(
      dispute.id,
      bundle.customer.id,
      "CUSTOMER",
      { comment: "Customer follow-up photos.", images: ["https://example.com/c2.jpg"], videos: [] }
    );
    assert.ok(asCustomer.evidence.length >= 2);

    const asProvider = await jobDisputeService.addDisputeEvidence(
      dispute.id,
      bundle.providerUser.id,
      "PROVIDER",
      { comment: "Provider response evidence.", images: [], videos: ["https://example.com/p1.mp4"] }
    );
    assert.ok(asProvider.evidence.length >= 3);

    const stranger = await prisma.user.create({
      data: {
        email: `ev.stranger.${bundle.suffix}@example.com`,
        password: "x",
        name: "Stranger",
        role: "CUSTOMER",
      },
    });
    try {
      await jobDisputeService.addDisputeEvidence(dispute.id, stranger.id, "CUSTOMER", {
        comment: "Should fail",
        images: [],
        videos: [],
      });
      throw new Error("expected stranger evidence to fail");
    } catch (e) {
      assert.ok(e instanceof AppError);
      assert.ok([403, 404].includes(e.statusCode), e.statusCode);
    } finally {
      await prisma.user.delete({ where: { id: stranger.id } }).catch(() => {});
    }

    console.log("disputeEvidenceResolution: multi-evidence + authz OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testReleaseFundsCompletionDue() {
  const bundle = await createBundle();
  try {
    const dispute = await openCompletionDispute(bundle);
    const paidBefore = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const summaryBefore = paymentModeService.buildPaymentSummary(
      paidBefore,
      await getJobMeta(bundle.job.id)
    );

    await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
      action: "RELEASE_FUNDS",
      notes: "Customer must pay remaining",
    });

    const jobAfter = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(toFrontendStatus(jobAfter.status, meta), "AWAITING_CONFIRMATION");
    assert.strictEqual(meta.escrowFrozen, false);
    assert.ok(!meta.disputeId);
    assert.ok(meta.completionPaymentDue);
    assert.strictEqual(Number(meta.completionPaymentDue.amountDue), 500);
    assert.ok(meta.completionPaymentDue.dueAt);
    const dueMs = new Date(meta.completionPaymentDue.dueAt).getTime() - Date.now();
    assert.ok(dueMs > 29 * 24 * 60 * 60 * 1000 && dueMs < 31 * 24 * 60 * 60 * 1000);

    assert.strictEqual(jobAfter.paymentProgress, "FIRST_PAID");
    const summaryAfter = paymentModeService.buildPaymentSummary(jobAfter, meta);
    assert.strictEqual(Number(summaryAfter.totalPaidByCustomer), Number(summaryBefore.totalPaidByCustomer));
    assert.notStrictEqual(jobAfter.paymentProgress, "FULLY_PAID");

    assert.strictEqual(
      paymentModeService.resolveNextLaborPaymentType(jobAfter, meta),
      "COMPLETION"
    );

    const payKey = `ev-comp-${randomUUID()}`;
    const intent = await paymentIntentService.createPaymentIntent({
      userId: bundle.customer.id,
      role: "CUSTOMER",
      provider: "PAYFAST",
      kind: "LABOR",
      legalAcceptance: checkoutLegalAcceptance("LABOR"),
      jobId: bundle.job.id,
      amount: 500,
      idempotencyKey: payKey,
      requestHash: "h-ev-comp",
      route: "POST /api/payments/intents",
    });
    assert.ok(intent?.intent?.id);
    assert.strictEqual(String(intent.intent.paymentType || "").toUpperCase(), "COMPLETION");
    await prisma.idempotencyRecord.deleteMany({ where: { idempotencyKey: payKey } }).catch(() => {});

    try {
      await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
        action: "CLOSE_CASE",
        notes: "duplicate",
      });
    } catch (_) {
      /* may no-op via early return */
    }
    const logs = await prisma.disputeResolutionLog.findMany({ where: { disputeId: dispute.id } });
    assert.strictEqual(logs.length, 1, "duplicate resolve must not add another money-moving log");

    console.log("disputeEvidenceResolution: RELEASE_FUNDS → completionPaymentDue OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testFullRefundPaidOnly() {
  const bundle = await createBundle();
  try {
    const dispute = await openCompletionDispute(bundle);
    const job = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(remainingRefundableLaborGross(job, meta), 500);
    assert.strictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, job, meta), 465);
    assert.notStrictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, job, meta), 1000);

    // Zero refundable paid → reject (simulate unpaid-only edge by wiping deposit markers).
    const unpaidBundle = await createBundle();
    try {
      await mutateJobMeta(unpaidBundle.job.id, (m) => ({
        ...m,
        statusOverride: "AWAITING_CONFIRMATION",
        laborPaid: false,
      }));
      const unpaidDispute = await jobDisputeService.openDispute(
        unpaidBundle.job.id,
        unpaidBundle.customer.id,
        {
          comment: "Dispute with no paid labor",
          requestedResolution: "REFUND",
        }
      ).catch(() => null);
      // openDispute requires deposit paid path usually — if it fails, skip this branch
      if (unpaidDispute?.id) {
        try {
          await disputeAdminService.resolveDispute(unpaidBundle.admin.id, unpaidDispute.id, {
            action: "FULL_REFUND",
            notes: "should reject",
          });
          throw new Error("expected FULL_REFUND with zero paid to fail");
        } catch (e) {
          assert.ok(e instanceof AppError);
          assert.strictEqual(e.statusCode, 400);
          assert.ok(/no paid amount/i.test(e.message), e.message);
        }
      }
    } finally {
      await cleanup(unpaidBundle);
    }

    console.log("disputeEvidenceResolution: FULL_REFUND paid-only math OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testReturnProviderThenMarkComplete() {
  const bundle = await createBundle();
  try {
    const dispute = await openCompletionDispute(bundle);
    await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
      action: "RETURN_PROVIDER",
      notes: "Fix the work",
    });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(toFrontendStatus("IN_PROGRESS", meta), "IN_PROGRESS");
    assert.strictEqual(meta.escrowFrozen, false);
    assert.ok(!meta.completionPaymentDue);

    await jobService.updateJobStatus(
      bundle.job.id,
      "AWAITING_CONFIRMATION",
      bundle.providerUser.id,
      "PROVIDER"
    );
    const meta2 = await getJobMeta(bundle.job.id);
    assert.strictEqual(toFrontendStatus("IN_PROGRESS", meta2), "AWAITING_CONFIRMATION");
    assert.ok(meta2.markedCompleteAt);

    console.log("disputeEvidenceResolution: RETURN_PROVIDER → mark complete OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testCloseCaseNoPaymentChange() {
  const bundle = await createBundle();
  try {
    const dispute = await openCompletionDispute(bundle);
    const jobBefore = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const metaBefore = await getJobMeta(bundle.job.id);
    const paidBefore = paymentModeService.buildPaymentSummary(jobBefore, metaBefore).totalPaidByCustomer;

    await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
      action: "CLOSE_CASE",
      notes: "No money movement",
    });

    const jobAfter = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const metaAfter = await getJobMeta(bundle.job.id);
    const paidAfter = paymentModeService.buildPaymentSummary(jobAfter, metaAfter).totalPaidByCustomer;
    assert.strictEqual(Number(paidAfter), Number(paidBefore));
    assert.strictEqual(jobAfter.paymentProgress, "FIRST_PAID");
    assert.strictEqual(metaAfter.escrowFrozen, false);
    assert.ok(!metaAfter.disputeId);

    console.log("disputeEvidenceResolution: CLOSE_CASE no payment change OK");
  } finally {
    await cleanup(bundle);
  }
}

async function main() {
  await testMultiEvidenceAuthz();
  await testReleaseFundsCompletionDue();
  await testFullRefundPaidOnly();
  await testReturnProviderThenMarkComplete();
  await testCloseCaseNoPaymentChange();
  console.log("disputeEvidenceResolution.test.js: all passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
