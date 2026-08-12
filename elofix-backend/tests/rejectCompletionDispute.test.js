/**
 * Customer reject-completion → dispute: state, chat, payment gates, paid-only caps.
 * Run: node tests/rejectCompletionDispute.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const prisma = require("../src/config/prisma");
const paymentModeService = require("../src/services/payments/paymentMode.service");
const paymentIntentService = require("../src/services/payments/paymentIntent.service");
const webhookService = require("../src/services/payments/webhook.service");
const jobDisputeService = require("../src/services/jobDispute.service");
const { getJobMeta, mutateJobMeta, toFrontendStatus } = require("../src/services/jobMeta.service");
const {
  paidLaborGrossFromJob,
  remainingRefundableLaborGross,
  disputeGrossToLaborNet,
} = require("../src/utils/refundMath.util");
const AppError = require("../src/utils/AppError");

async function createBundle() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `rej.cust.${suffix}@example.com`,
      password: "x",
      name: "Reject Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `rej.prov.${suffix}@example.com`,
      password: "x",
      name: "Reject Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Reject Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const quoted = 1000;
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", quoted);
  const job = await prisma.job.create({
    data: {
      title: `Reject completion job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Reject completion dispute test",
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
  return { customer, providerUser, provider, job, schedule, suffix, savedCard };
}

async function cleanup(bundle) {
  if (!bundle) return;
  const jobId = bundle.job?.id;
  if (jobId) {
    const dispute = await prisma.jobDispute.findUnique({ where: { jobId } }).catch(() => null);
    if (dispute) {
      await prisma.disputeMessage.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.disputeResolutionLog.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDisputeRound.deleteMany({ where: { disputeId: dispute.id } }).catch(() => {});
      await prisma.jobDispute.delete({ where: { id: dispute.id } }).catch(() => {});
    }
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
    gatewayTransactionId: `gw-rej-${intent.id}`,
    state: "PAID",
    amount: Number(intent.amount),
    externalEventId: `rej-deposit-${intent.id}-${randomUUID().slice(0, 8)}`,
    raw: { source: "reject_completion_test", card_last4: "4242" },
  });
  assert.ok(!out.httpStatus || out.httpStatus < 400, `deposit webhook failed: ${out.message}`);
  await mutateJobMeta(bundle.job.id, (m) => ({ ...m, statusOverride: "AWAITING_CONFIRMATION" }));
  return intent;
}

async function testOpenDisputeDepositOnly() {
  const bundle = await createBundle();
  try {
    await payDeposit(bundle);
    const jobBefore = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    assert.strictEqual(jobBefore.paymentProgress, "FIRST_PAID");

    const dispute = await jobDisputeService.openDispute(bundle.job.id, bundle.customer.id, {
      comment: "Work is unfinished and not to standard.",
      requestedResolution: "PROVIDER_RETURN_FIX",
      images: [],
      videos: [],
    });
    assert.ok(dispute?.id);
    assert.strictEqual(dispute.status, "OPEN");

    const jobAfter = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(toFrontendStatus(jobAfter.status, meta), "DISPUTED");
    assert.strictEqual(meta.escrowFrozen, true);
    assert.strictEqual(meta.disputeId, dispute.id);
    assert.strictEqual(jobAfter.paymentProgress, "FIRST_PAID");

    const chat = Array.isArray(meta.chat) ? meta.chat : [];
    assert.ok(
      chat.some((c) => String(c.message || "").includes("rejected the provider's completion")),
      "expected system chat about rejection"
    );
    assert.ok(
      chat.some((c) => String(c.message || "").includes("submitted to EloFix")),
      "expected system chat about review"
    );

    const summary = paymentModeService.buildPaymentSummary(jobAfter, meta);
    assert.strictEqual(Number(summary.totalPaidByCustomer), 500);
    assert.strictEqual(Number(summary.totalRemainingByCustomer), 500);
    assert.strictEqual(summary.completion.status, "UNPAID");

    assert.strictEqual(paidLaborGrossFromJob(jobAfter, meta), 500);
    assert.strictEqual(remainingRefundableLaborGross(jobAfter, meta), 500);
    assert.strictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, jobAfter, meta), 465);
    assert.notStrictEqual(disputeGrossToLaborNet("FULL_REFUND", 0, jobAfter, meta), 1000);

    assert.strictEqual(
      paymentModeService.resolveNextLaborPaymentType(jobAfter, meta),
      null,
      "completion must not be due while disputed"
    );

    const payKey = `rej-pay-${randomUUID()}`;
    try {
      await paymentIntentService.createPaymentIntent({
        userId: bundle.customer.id,
        role: "CUSTOMER",
        provider: "PAYFAST",
        cardId: bundle.savedCard.id,
        cvv: "123",
        kind: "LABOR",
        jobId: bundle.job.id,
        amount: 500,
        idempotencyKey: payKey,
        requestHash: "h-rej-pay",
        route: "POST /api/payments/intents",
      });
      throw new Error("expected createPaymentIntent to fail while disputed");
    } catch (e) {
      assert.ok(e instanceof AppError, `expected AppError, got ${e}`);
      assert.strictEqual(e.statusCode, 400);
      assert.ok(/dispute/i.test(e.message), e.message);
    } finally {
      await prisma.idempotencyRecord.deleteMany({ where: { idempotencyKey: payKey } }).catch(() => {});
    }

    try {
      await jobDisputeService.openDispute(bundle.job.id, bundle.customer.id, {
        comment: "Second attempt should fail.",
        requestedResolution: "REFUND",
      });
      throw new Error("expected duplicate dispute to fail");
    } catch (e) {
      assert.ok(e instanceof AppError);
      assert.strictEqual(e.statusCode, 400);
      assert.ok(/already open/i.test(e.message), e.message);
    }

    console.log("rejectCompletionDispute.test.js: open + gates OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testCompletionIntentCancelledOnDispute() {
  const bundle = await createBundle();
  try {
    await payDeposit(bundle);
    const completionIntent = await prisma.paymentIntent.create({
      data: {
        id: randomUUID(),
        merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
        provider: "PAYFAST",
        kind: "LABOR",
        paymentType: "COMPLETION",
        userId: bundle.customer.id,
        jobId: bundle.job.id,
        amount: 500,
        currency: "ZAR",
        state: "PENDING",
        escrowStatus: "NOT_APPLICABLE",
      },
    });

    await jobDisputeService.openDispute(bundle.job.id, bundle.customer.id, {
      comment: "Rejecting before completion pay settles.",
      requestedResolution: "REFUND",
    });

    const refreshed = await prisma.paymentIntent.findUnique({ where: { id: completionIntent.id } });
    assert.ok(refreshed);
    assert.strictEqual(refreshed.state, "CANCELLED");

    const out = await webhookService.processWebhookResult("PAYFAST", {
      valid: true,
      merchantReference: completionIntent.merchantReference,
      gatewayTransactionId: `gw-rej-comp-${completionIntent.id}`,
      state: "PAID",
      amount: 500,
      externalEventId: `rej-comp-${completionIntent.id}-${randomUUID().slice(0, 8)}`,
      raw: { source: "reject_completion_race_test", card_last4: "4242" },
    });
    // Settlement must not advance paymentProgress to FULLY_PAID while disputed.
    const jobAfter = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    assert.strictEqual(jobAfter.paymentProgress, "FIRST_PAID");
    assert.notStrictEqual(jobAfter.paymentProgress, "FULLY_PAID");
    // Webhook may report failure or roll back; either way completion stays unpaid.
    void out;

    console.log("rejectCompletionDispute.test.js: pending completion cancelled OK");
  } finally {
    await cleanup(bundle);
  }
}

async function main() {
  await testOpenDisputeDepositOnly();
  await testCompletionIntentCancelledOnDispute();
  console.log("rejectCompletionDispute.test.js: all passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
