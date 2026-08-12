/**
 * TWO_PAYMENT_50_50 second-tranche integrity:
 * DEPOSIT then COMPLETION as separate PaymentIntents + webhook idempotency.
 *
 * Run: node tests/paymentCompletion.secondTranche.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");

const paymentModeService = require("../src/services/payments/paymentMode.service");
const webhookService = require("../src/services/payments/webhook.service");
const { enrichJob, normalizeMeta, getJobMeta, mutateJobMeta } = require("../src/services/jobMeta.service");
const { splitCommission } = require("../src/services/payments/money.util");

function approxEqual(a, b, eps = 0.02) {
  assert.ok(Math.abs(Number(a) - Number(b)) <= eps, `expected ${a} ≈ ${b}`);
}

async function createBundle(prisma, { mode = "TWO_PAYMENT_50_50", quoted = 1000, legacyEscrowV2 = false } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const customer = await prisma.user.create({
    data: {
      email: `comp.cust.${suffix}@example.com`,
      password: "x",
      name: "Completion Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `comp.prov.${suffix}@example.com`,
      password: "x",
      name: "Completion Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Comp Biz ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const schedule = paymentModeService.computePaymentSchedule(mode, quoted);
  const job = await prisma.job.create({
    data: {
      title: `Completion job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "Second tranche integrity job",
      price: quoted,
      totalPrice: quoted,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "ACCEPTED",
      legacyEscrowV2: Boolean(legacyEscrowV2),
      paymentModeSnapshot: legacyEscrowV2 ? null : mode,
      quotedAmount: schedule.quotedAmount,
      firstPaymentAmount: schedule.firstPaymentAmount,
      secondPaymentAmount: schedule.secondPaymentAmount,
      paymentProgress: "NONE",
      meta: {
        servicePrice: { amount: quoted, submittedAt: new Date().toISOString() },
        statusOverride: "SERVICE_PRICE_SUBMITTED",
      },
    },
  });
  return { customer, providerUser, provider, job, suffix, schedule };
}

async function cleanup(prisma, bundle) {
  if (!bundle) return;
  const jobId = bundle.job?.id;
  if (jobId) {
    await prisma.paymentWebhookEvent
      .deleteMany({ where: { paymentIntentId: { in: (await prisma.paymentIntent.findMany({ where: { jobId }, select: { id: true } })).map((i) => i.id) } } })
      .catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.earning.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { jobId } }).catch(() => {});
    await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
  }
  if (bundle.provider?.id) await prisma.provider.delete({ where: { id: bundle.provider.id } }).catch(() => {});
  if (bundle.providerUser?.id) await prisma.user.delete({ where: { id: bundle.providerUser.id } }).catch(() => {});
  if (bundle.customer?.id) await prisma.user.delete({ where: { id: bundle.customer.id } }).catch(() => {});
}

async function createLaborIntent(prisma, { job, customerId, paymentType, amount }) {
  return prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
      provider: "PAYFAST",
      kind: "LABOR",
      paymentType,
      userId: customerId,
      jobId: job.id,
      amount,
      currency: "ZAR",
      state: "PENDING",
      escrowStatus: "NOT_APPLICABLE",
    },
  });
}

async function settleViaWebhook(intent, { externalEventId, amount } = {}) {
  const eventId = externalEventId || `test-settle-${intent.id}-${randomUUID().slice(0, 8)}`;
  const out = await webhookService.processWebhookResult("PAYFAST", {
    valid: true,
    merchantReference: intent.merchantReference,
    gatewayTransactionId: `gw-${eventId}`,
    state: "PAID",
    amount: amount != null ? amount : Number(intent.amount),
    externalEventId: eventId,
    raw: { source: "second_tranche_test", intentId: intent.id, card_last4: "4242" },
  });
  assert.ok(!out.httpStatus || out.httpStatus < 400, `webhook failed: ${out.message || JSON.stringify(out)}`);
  return { out, eventId };
}

async function testDepositThenCompletion(prisma) {
  const bundle = await createBundle(prisma, { quoted: 1000 });
  try {
    const depositAmt = Number(bundle.schedule.firstPaymentAmount);
    const completionAmt = Number(bundle.schedule.secondPaymentAmount);
    approxEqual(depositAmt, 500);
    approxEqual(completionAmt, 500);

    const depositIntent = await createLaborIntent(prisma, {
      job: bundle.job,
      customerId: bundle.customer.id,
      paymentType: "DEPOSIT",
      amount: depositAmt,
    });
    await settleViaWebhook(depositIntent);

    const afterDeposit = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    assert.strictEqual(afterDeposit.paymentProgress, "FIRST_PAID");
    assert.strictEqual(afterDeposit.laborPaid, true);
    const depSplit = splitCommission(depositAmt);
    approxEqual(Number(afterDeposit.commissionAmount), Number(depSplit.commissionAmount));
    approxEqual(Number(afterDeposit.providerAmount), Number(depSplit.recipientAmount));

    const metaAfterDeposit = await getJobMeta(bundle.job.id);
    const summaryAfterDeposit = paymentModeService.buildPaymentSummary(afterDeposit, metaAfterDeposit);
    approxEqual(summaryAfterDeposit.totalPaidByCustomer, 500);
    approxEqual(summaryAfterDeposit.totalRemainingByCustomer, 500);
    approxEqual(summaryAfterDeposit.providerShareRecorded, Number(depSplit.recipientAmount));
    approxEqual(summaryAfterDeposit.providerShareRemaining, Number(depSplit.recipientAmount));
    assert.strictEqual(summaryAfterDeposit.deposit.status, "PAID");
    assert.strictEqual(summaryAfterDeposit.completion.status, "UNPAID");
    assert.notStrictEqual(summaryAfterDeposit.label, "FULLY_PAID");

    // COMPLETION not due until awaiting confirmation
    assert.strictEqual(
      paymentModeService.resolveNextLaborPaymentType(afterDeposit, metaAfterDeposit),
      null
    );

    await mutateJobMeta(bundle.job.id, (m) => ({ ...m, statusOverride: "AWAITING_CONFIRMATION" }));
    const metaAwaiting = await getJobMeta(bundle.job.id);
    assert.strictEqual(
      paymentModeService.resolveNextLaborPaymentType(afterDeposit, metaAwaiting),
      "COMPLETION"
    );

    const completionIntent = await createLaborIntent(prisma, {
      job: bundle.job,
      customerId: bundle.customer.id,
      paymentType: "COMPLETION",
      amount: completionAmt,
    });
    assert.notStrictEqual(completionIntent.id, depositIntent.id);
    assert.notStrictEqual(completionIntent.merchantReference, depositIntent.merchantReference);
    assert.strictEqual(completionIntent.paymentType, "COMPLETION");
    approxEqual(Number(completionIntent.amount), 500);

    const { eventId: completionEventId } = await settleViaWebhook(completionIntent);

    const afterBoth = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    assert.strictEqual(afterBoth.paymentProgress, "FULLY_PAID");
    const totalSplit = splitCommission(1000);
    // Two R500 splits: 35+35 commission, 465+465 provider
    approxEqual(Number(afterBoth.commissionAmount), 70);
    approxEqual(Number(afterBoth.providerAmount), 930);
    approxEqual(Number(totalSplit.commissionAmount), 70);
    approxEqual(Number(totalSplit.recipientAmount), 930);

    const depositStill = await prisma.paymentIntent.findUnique({ where: { id: depositIntent.id } });
    assert.strictEqual(depositStill.state, "PAID");
    assert.strictEqual(depositStill.paymentType, "DEPOSIT");
    approxEqual(Number(depositStill.amount), 500);

    const ledgers = await prisma.commissionLedger.findMany({ where: { jobId: bundle.job.id } });
    assert.strictEqual(ledgers.length, 2);

    const metaFinal = await getJobMeta(bundle.job.id);
    const summaryFinal = paymentModeService.buildPaymentSummary(afterBoth, metaFinal);
    approxEqual(summaryFinal.totalPaidByCustomer, 1000);
    approxEqual(summaryFinal.totalRemainingByCustomer, 0);
    approxEqual(summaryFinal.providerShareRecorded, 930);
    approxEqual(summaryFinal.providerShareRemaining, 0);
    assert.strictEqual(summaryFinal.label, "FULLY_PAID");

    const enriched = enrichJob(afterBoth, normalizeMeta(metaFinal));
    approxEqual(enriched.customerPaidTotal, 1000);
    assert.ok(enriched.paymentSummary);
    approxEqual(enriched.paymentSummary.totalRemainingByCustomer, 0);

    // Duplicate COMPLETION webhook must not double-count
    const beforeComm = Number(afterBoth.commissionAmount);
    const beforeProv = Number(afterBoth.providerAmount);
    await settleViaWebhook(completionIntent, { externalEventId: completionEventId, amount: completionAmt });
    const afterDup = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    approxEqual(Number(afterDup.commissionAmount), beforeComm);
    approxEqual(Number(afterDup.providerAmount), beforeProv);
    const ledgersAfter = await prisma.commissionLedger.findMany({ where: { jobId: bundle.job.id } });
    assert.strictEqual(ledgersAfter.length, 2);
  } finally {
    await cleanup(prisma, bundle);
  }
}

async function testFailedCompletionReuseNotDeposit(prisma) {
  const bundle = await createBundle(prisma, { quoted: 1000 });
  try {
    const depositIntent = await createLaborIntent(prisma, {
      job: bundle.job,
      customerId: bundle.customer.id,
      paymentType: "DEPOSIT",
      amount: 500,
    });
    await settleViaWebhook(depositIntent);
    await mutateJobMeta(bundle.job.id, (m) => ({ ...m, statusOverride: "AWAITING_CONFIRMATION" }));

    const failedCompletion = await createLaborIntent(prisma, {
      job: bundle.job,
      customerId: bundle.customer.id,
      paymentType: "COMPLETION",
      amount: 500,
    });
    await prisma.paymentIntent.update({
      where: { id: failedCompletion.id },
      data: { state: "FAILED", failedAt: new Date() },
    });

    // App-level reuse: same paymentType non-PAID only
    const reusable = await prisma.paymentIntent.findFirst({
      where: {
        jobId: bundle.job.id,
        kind: "LABOR",
        paymentType: "COMPLETION",
        state: { in: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"] },
      },
    });
    assert.ok(reusable);
    assert.strictEqual(reusable.id, failedCompletion.id);
    assert.notStrictEqual(reusable.id, depositIntent.id);

    const paidDepositReuse = await prisma.paymentIntent.findFirst({
      where: {
        jobId: bundle.job.id,
        kind: "LABOR",
        paymentType: "COMPLETION",
        state: "PAID",
        id: depositIntent.id,
      },
    });
    assert.strictEqual(paidDepositReuse, null);
  } finally {
    await cleanup(prisma, bundle);
  }
}

async function testSingleModes(prisma) {
  for (const mode of ["SINGLE_PAYMENT_UPFRONT", "SINGLE_PAYMENT_ON_COMPLETION"]) {
    const bundle = await createBundle(prisma, { mode, quoted: 1000 });
    try {
      if (mode === "SINGLE_PAYMENT_ON_COMPLETION") {
        await mutateJobMeta(bundle.job.id, (m) => ({ ...m, statusOverride: "AWAITING_CONFIRMATION" }));
      }
      const paymentType = mode === "SINGLE_PAYMENT_UPFRONT" ? "FULL_UPFRONT" : "FULL_COMPLETION";
      const intent = await createLaborIntent(prisma, {
        job: bundle.job,
        customerId: bundle.customer.id,
        paymentType,
        amount: 1000,
      });
      await settleViaWebhook(intent);
      const job = await prisma.job.findUnique({ where: { id: bundle.job.id } });
      assert.strictEqual(job.paymentProgress, "FULLY_PAID");
      approxEqual(Number(job.commissionAmount), 70);
      approxEqual(Number(job.providerAmount), 930);
      const summary = paymentModeService.buildPaymentSummary(job, await getJobMeta(bundle.job.id));
      approxEqual(summary.totalPaidByCustomer, 1000);
      approxEqual(summary.totalRemainingByCustomer, 0);
      if (mode === "SINGLE_PAYMENT_UPFRONT") {
        assert.strictEqual(summary.completion, null);
        assert.strictEqual(summary.deposit.status, "PAID");
      } else {
        assert.strictEqual(summary.deposit, null);
        assert.strictEqual(summary.completion.status, "PAID");
      }
    } finally {
      await cleanup(prisma, bundle);
    }
  }
}

async function testLegacyIsolation(prisma) {
  const bundle = await createBundle(prisma, { quoted: 1000, legacyEscrowV2: true });
  try {
    // Force legacy flag without new-mode snapshot
    await prisma.job.update({
      where: { id: bundle.job.id },
      data: {
        legacyEscrowV2: true,
        paymentModeSnapshot: null,
        paymentProgress: "NONE",
      },
    });
    const job = await prisma.job.findUnique({ where: { id: bundle.job.id } });
    assert.strictEqual(paymentModeService.resolveNextLaborPaymentType(job, {}), null);
    const enriched = enrichJob(job, normalizeMeta(job.meta));
    assert.strictEqual(enriched.paymentSummary, null);
  } finally {
    await cleanup(prisma, bundle);
  }
}

async function main() {
  testDepositThenCompletionUnit();
  const prisma = require("../src/config/prisma");
  await testDepositThenCompletion(prisma);
  await testFailedCompletionReuseNotDeposit(prisma);
  await testSingleModes(prisma);
  await testLegacyIsolation(prisma);
  console.log("paymentCompletion.secondTranche.test.js: OK");
}

function testDepositThenCompletionUnit() {
  const schedule = paymentModeService.computePaymentSchedule("TWO_PAYMENT_50_50", 1000);
  approxEqual(Number(schedule.firstPaymentAmount), 500);
  approxEqual(Number(schedule.secondPaymentAmount), 500);
  const a = splitCommission(500);
  const b = splitCommission(500);
  approxEqual(Number(a.commissionAmount) + Number(b.commissionAmount), 70);
  approxEqual(Number(a.recipientAmount) + Number(b.recipientAmount), 930);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
