/**
 * Webhook post-settlement retry: PAID may be recorded before delivery/job-store settlement.
 * A PSP retry must resume incomplete settlement without duplicating the PaymentIntent outcome.
 * Run: node tests/webhookPostSettlement.retry.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");

const { runTestMain } = require("./helpers/shutdown");

if (!process.env.DATABASE_URL) {
  console.log("webhookPostSettlement.retry.test.js: skip (DATABASE_URL not set)");
  process.exit(0);
}

const prisma = require("../src/config/prisma");
const webhookService = require("../src/services/payments/webhook.service");
const escrowSettlement = require("../src/services/payments/escrowSettlement.service");

async function ensureCustomer() {
  return (
    (await prisma.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } })) ||
    (await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `wh.retry.${Date.now()}@example.com`,
        password: "x",
        name: "Webhook Retry",
        role: "CUSTOMER",
      },
      select: { id: true },
    }))
  );
}

async function createIntent({ kind, amount = "80.00" }) {
  const user = await ensureCustomer();
  const id = randomUUID();
  const merchantReference = `EF-PS-${id.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  await prisma.paymentIntent.create({
    data: {
      id,
      merchantReference,
      provider: "PAYFAST",
      kind,
      userId: user.id,
      amount: new Prisma.Decimal(amount),
      commissionAmount: new Prisma.Decimal("5.60"),
      recipientAmount: new Prisma.Decimal("74.40"),
      currency: "ZAR",
      state: "PENDING",
      escrowStatus: "NOT_APPLICABLE",
    },
  });
  return { id, merchantReference };
}

function paidPayload(intent, extraRaw = {}) {
  return {
    valid: true,
    merchantReference: intent.merchantReference,
    gatewayTransactionId: `gw-${intent.id}`,
    state: "PAID",
    amount: 80,
    externalEventId: `evt-${intent.id}`,
    raw: { source: "phase_a1_retry_test", ...extraRaw },
  };
}

async function loadEvent(intentId) {
  return prisma.paymentWebhookEvent.findFirst({ where: { paymentIntentId: intentId } });
}

async function testNormalPaidAndDuplicate() {
  const intent = await createIntent({ kind: "PROVIDER_REFUND_REPAYMENT" });
  const payload = paidPayload(intent);

  const first = await webhookService.processWebhookResult("PAYFAST", payload);
  assert.strictEqual(first.httpStatus, 200, "1. normal PAID webhook succeeds");
  const paid = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
  assert.strictEqual(paid.state, "PAID");
  const ev1 = await loadEvent(intent.id);
  assert.ok(ev1.processedAt, "13. processedAt set after completion");
  assert.notStrictEqual(ev1.processingError, webhookService.POST_SETTLEMENT_PENDING);

  const dup = await webhookService.processWebhookResult("PAYFAST", payload);
  assert.strictEqual(dup.httpStatus, 200, "14. fully completed duplicate returns success");
  assert.ok(dup.result?.duplicate || dup.result?.fullyProcessed || dup.result?.processed);

  const intents = await prisma.paymentIntent.count({ where: { merchantReference: intent.merchantReference } });
  assert.strictEqual(intents, 1, "7. only one PaymentIntent");
  const events = await prisma.paymentWebhookEvent.count({
    where: { provider: "PAYFAST", externalEventId: payload.externalEventId },
  });
  assert.strictEqual(events, 1, "2. duplicate creates no extra webhook events");
}

async function testDeliveryFeeRetry() {
  const intent = await createIntent({ kind: "DELIVERY_FEE" });
  const payload = paidPayload(intent);
  const orig = escrowSettlement.settleDeliveryFeeFromIntent;
  let settleCalls = 0;
  let accountingWrites = 0;
  escrowSettlement.settleDeliveryFeeFromIntent = async (row) => {
    settleCalls += 1;
    if (settleCalls === 1) {
      throw new Error("injected delivery settlement failure");
    }
    accountingWrites += 1;
    assert.strictEqual(row.id, intent.id);
    return { materialOrderId: "mock-once" };
  };
  try {
    const first = await webhookService.processWebhookResult("PAYFAST", payload);
    assert.ok(first.httpStatus >= 500, "4. first webhook returns retryable failure");
    const afterFail = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    assert.strictEqual(afterFail.state, "PAID", "3. payment recorded before settlement failure");
    const evFail = await loadEvent(intent.id);
    assert.ok(!evFail.processedAt, "13. processedAt unset while settlement incomplete");
    assert.strictEqual(evFail.processingError, webhookService.POST_SETTLEMENT_PENDING);

    const second = await webhookService.processWebhookResult("PAYFAST", payload);
    assert.strictEqual(second.httpStatus, 200, "5-6. retry completes missing settlement");
    assert.strictEqual(settleCalls, 2);
    assert.strictEqual(accountingWrites, 1, "8-9. only one delivery/accounting settlement");

    const evOk = await loadEvent(intent.id);
    assert.ok(evOk.processedAt, "13. processedAt after successful retry");
    assert.strictEqual(evOk.processingError, null);

    const third = await webhookService.processWebhookResult("PAYFAST", payload);
    assert.strictEqual(third.httpStatus, 200, "14. already completed duplicate is success");
    assert.strictEqual(settleCalls, 2, "no third settlement on fully processed duplicate");
    const still = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    assert.strictEqual(still.state, "PAID");
    const intentCount = await prisma.paymentIntent.count({
      where: { merchantReference: intent.merchantReference },
    });
    assert.strictEqual(intentCount, 1);
  } finally {
    escrowSettlement.settleDeliveryFeeFromIntent = orig;
  }
}

async function testJobStoreRetry() {
  const intent = await createIntent({ kind: "JOB_STORE_ORDER" });
  const payload = paidPayload(intent, { supplierId: "sup-1", orderId: "ord-1" });
  const orig = escrowSettlement.settleJobStoreOrderFromIntent;
  let calls = 0;
  let transitions = 0;
  escrowSettlement.settleJobStoreOrderFromIntent = async (row) => {
    calls += 1;
    if (calls === 1) {
      throw new Error("injected job-store settlement failure");
    }
    transitions += 1;
    assert.strictEqual(row.id, intent.id);
    return { applied: true };
  };
  try {
    const first = await webhookService.processWebhookResult("PAYFAST", payload);
    assert.ok(first.httpStatus >= 500, "11. job-store post-settlement transient failure");
    assert.strictEqual((await prisma.paymentIntent.findUnique({ where: { id: intent.id } })).state, "PAID");

    const second = await webhookService.processWebhookResult("PAYFAST", payload);
    assert.strictEqual(second.httpStatus, 200, "12. retry completes job-store settlement");
    assert.strictEqual(calls, 2);
    assert.strictEqual(transitions, 1, "10. only one job/material transition");

    const intents = await prisma.paymentIntent.count({ where: { merchantReference: intent.merchantReference } });
    assert.strictEqual(intents, 1, "retry must not create a second PaymentIntent");
    const ev = await loadEvent(intent.id);
    assert.ok(ev.processedAt);
  } finally {
    escrowSettlement.settleJobStoreOrderFromIntent = orig;
  }
}

async function run() {
  await testNormalPaidAndDuplicate();
  await testDeliveryFeeRetry();
  await testJobStoreRetry();
  console.log("webhookPostSettlement.retry.test.js: all passed");
}

runTestMain(run);
