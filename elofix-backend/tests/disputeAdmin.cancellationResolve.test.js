/**
 * Cancellation dispute resolve uses the same four actions as completion disputes.
 * Run: node tests/disputeAdmin.cancellationResolve.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const prisma = require("../src/config/prisma");
const paymentModeService = require("../src/services/payments/paymentMode.service");
const webhookService = require("../src/services/payments/webhook.service");
const jobDisputeService = require("../src/services/jobDispute.service");
const disputeAdminService = require("../src/services/disputeAdmin.service");
const { getJobMeta, mutateJobMeta, toFrontendStatus } = require("../src/services/jobMeta.service");
const { remainingRefundableLaborGross } = require("../src/utils/refundMath.util");
const AppError = require("../src/utils/AppError");

async function createBundle() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `cx.cust.${suffix}@example.com`,
      password: "x",
      name: "Cancel Cust",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `cx.prov.${suffix}@example.com`,
      password: "x",
      name: "Cancel Prov",
      role: "PROVIDER",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `cx.admin.${suffix}@example.com`,
      password: "x",
      name: "Cancel Admin",
      role: "ADMIN",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Cancel Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const quoted = 500;
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", quoted);
  const job = await prisma.job.create({
    data: {
      title: `Cancel resolve ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "cancellation resolve parity",
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
  return { customer, providerUser, provider, admin, job, schedule, suffix };
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
    await prisma.commissionLedger.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.earning.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
  }
  if (bundle.provider?.id) await prisma.provider.delete({ where: { id: bundle.provider.id } }).catch(() => {});
  if (bundle.providerUser?.id) await prisma.user.delete({ where: { id: bundle.providerUser.id } }).catch(() => {});
  if (bundle.customer?.id) await prisma.user.delete({ where: { id: bundle.customer.id } }).catch(() => {});
  if (bundle.admin?.id) await prisma.user.delete({ where: { id: bundle.admin.id } }).catch(() => {});
}

async function payDepositAndOpenCancelDispute(bundle) {
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
  await webhookService.processWebhookResult("PAYFAST", {
    valid: true,
    merchantReference: intent.merchantReference,
    gatewayTransactionId: `gw-cx-${intent.id}`,
    state: "PAID",
    amount: Number(intent.amount),
    externalEventId: `cx-dep-${intent.id}-${randomUUID().slice(0, 8)}`,
    raw: { source: "cancel_resolve_test", card_last4: "4242" },
  });
  await mutateJobMeta(bundle.job.id, (m) => ({
    ...m,
    statusOverride: "IN_PROGRESS",
    laborPaid: true,
  }));

  return jobDisputeService.openDisputeFromCancellation(bundle.job.id, bundle.customer.id, {
    reason: "changed_mind",
    details: "Customer cancelled after deposit",
    actorRole: "customer",
  });
}

async function testReleaseOnCancellationSetsPaymentDue() {
  const bundle = await createBundle();
  try {
    const dispute = await payDepositAndOpenCancelDispute(bundle);
    assert.ok(dispute?.id);

    await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
      action: "RELEASE_FUNDS",
      notes: "Customer must pay remaining",
    });

    const job = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(toFrontendStatus(job.status, meta), "AWAITING_CONFIRMATION");
    assert.ok(meta.completionPaymentDue);
    assert.strictEqual(Number(meta.completionPaymentDue.amountDue), 250);
    assert.ok(!meta.cancellationSource);
    assert.strictEqual(job.paymentProgress, "FIRST_PAID");
    assert.notStrictEqual(job.paymentProgress, "FULLY_PAID");
    console.log("disputeAdmin.cancellationResolve: RELEASE_FUNDS → payment due OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testReturnProviderOnCancellation() {
  const bundle = await createBundle();
  try {
    const dispute = await payDepositAndOpenCancelDispute(bundle);
    await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
      action: "RETURN_PROVIDER",
      notes: "Continue work",
    });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(toFrontendStatus("IN_PROGRESS", meta), "IN_PROGRESS");
    assert.ok(!meta.cancellationSource);
    assert.strictEqual(meta.escrowFrozen, false);
    console.log("disputeAdmin.cancellationResolve: RETURN_PROVIDER OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testCloseCaseNoMoneyOnCancellation() {
  const bundle = await createBundle();
  try {
    const dispute = await payDepositAndOpenCancelDispute(bundle);
    const before = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const metaBefore = await getJobMeta(bundle.job.id);
    const paidBefore = paymentModeService.buildPaymentSummary(before, metaBefore).totalPaidByCustomer;

    await disputeAdminService.resolveDispute(bundle.admin.id, dispute.id, {
      action: "CLOSE_CASE",
      notes: "No movement",
    });

    const after = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const metaAfter = await getJobMeta(bundle.job.id);
    const paidAfter = paymentModeService.buildPaymentSummary(after, metaAfter).totalPaidByCustomer;
    assert.strictEqual(Number(paidAfter), Number(paidBefore));
    assert.strictEqual(after.paymentProgress, "FIRST_PAID");
    assert.strictEqual(metaAfter.escrowFrozen, false);
    console.log("disputeAdmin.cancellationResolve: CLOSE_CASE no money OK");
  } finally {
    await cleanup(bundle);
  }
}

async function testRefundPaidOnlyMath() {
  const bundle = await createBundle();
  try {
    const dispute = await payDepositAndOpenCancelDispute(bundle);
    const job = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    const meta = await getJobMeta(bundle.job.id);
    assert.strictEqual(remainingRefundableLaborGross(job, meta), 250);
    assert.notStrictEqual(remainingRefundableLaborGross(job, meta), 500);
    void dispute;
    console.log("disputeAdmin.cancellationResolve: paid-only refundable OK");
  } finally {
    await cleanup(bundle);
  }
}

async function main() {
  assert.strictEqual(disputeAdminService.isCancellationDispute({ cancellationSource: "customer_cancel" }), true);
  await testReleaseOnCancellationSetsPaymentDue();
  await testReturnProviderOnCancellation();
  await testCloseCaseNoMoneyOnCancellation();
  await testRefundPaidOnlyMath();
  console.log("disputeAdmin.cancellationResolve.test.js: all passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
