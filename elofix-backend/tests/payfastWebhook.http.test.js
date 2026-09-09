/**
 * PayFast webhook ACK-after-durable-process + idempotency.
 * Run: node tests/payfastWebhook.http.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const { listenApp, httpRequest } = require("./helpers/httpServer");

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-file-access-secret-key";

async function testAckWaitsForProcessing() {
  const webhookService = require("../src/services/payments/webhook.service");
  const original = webhookService.handlePayfastWebhook;
  let finished = false;
  webhookService.handlePayfastWebhook = async () => {
    await new Promise((r) => setTimeout(r, 80));
    finished = true;
    return { httpStatus: 200 };
  };
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const started = Date.now();
    const res = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
      form: { m_payment_id: "EF-TEST", payment_status: "COMPLETE" },
    });
    const elapsed = Date.now() - started;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, "OK");
    assert.strictEqual(finished, true, "HTTP ACK must wait until handlePayfastWebhook finishes");
    assert.ok(elapsed >= 70, "ACK was returned too quickly to have awaited processing");
  } finally {
    webhookService.handlePayfastWebhook = original;
    await h.close();
  }
}

async function testInvalidEventNoSuccessAck() {
  const webhookService = require("../src/services/payments/webhook.service");
  const original = webhookService.handlePayfastWebhook;
  webhookService.handlePayfastWebhook = async () => ({ httpStatus: 400, message: "Invalid webhook" });
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const res = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
      form: { m_payment_id: "bad", payment_status: "COMPLETE" },
    });
    assert.ok(res.status >= 400, "invalid webhook must not ACK 200");
  } finally {
    webhookService.handlePayfastWebhook = original;
    await h.close();
  }
}

async function testTransientFailureNoAck() {
  const webhookService = require("../src/services/payments/webhook.service");
  const original = webhookService.handlePayfastWebhook;
  webhookService.handlePayfastWebhook = async () => ({ httpStatus: 500, message: "Webhook processing failed" });
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const res = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
      form: { m_payment_id: "EF-FAIL", payment_status: "COMPLETE" },
    });
    assert.ok(res.status >= 500, "transient failure must not ACK success");
  } finally {
    webhookService.handlePayfastWebhook = original;
    await h.close();
  }
}

async function testProcessWebhookIdempotency() {
  if (!process.env.DATABASE_URL) {
    console.log("payfastWebhook.http.test.js: skip DB idempotency (DATABASE_URL not set)");
    return;
  }
  const { Prisma } = require("@prisma/client");
  const prisma = require("../src/config/prisma");
  const webhookService = require("../src/services/payments/webhook.service");
  const merchantReference = `EF-WH-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const intentId = randomUUID();
  const user =
    (await prisma.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } })) ||
    (await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `wh.${Date.now()}@example.com`,
        password: "x",
        name: "Webhook",
        role: "CUSTOMER",
      },
      select: { id: true },
    }));

  await prisma.paymentIntent.create({
    data: {
      id: intentId,
      merchantReference,
      provider: "PAYFAST",
      kind: "PROVIDER_REFUND_REPAYMENT",
      userId: user.id,
      amount: new Prisma.Decimal("50.00"),
      commissionAmount: new Prisma.Decimal("3.50"),
      recipientAmount: new Prisma.Decimal("46.50"),
      currency: "ZAR",
      state: "PENDING",
      escrowStatus: "NOT_APPLICABLE",
    },
  });

  const payload = {
    valid: true,
    merchantReference,
    gatewayTransactionId: `gw-${intentId}`,
    state: "PAID",
    amount: 50,
    externalEventId: `evt-${intentId}`,
    raw: { source: "phase_a_webhook_test" },
  };

  const first = await webhookService.processWebhookResult("PAYFAST", payload);
  assert.ok(first.httpStatus == null || first.httpStatus < 400);
  const paid = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  assert.strictEqual(paid.state, "PAID");

  const dup = await webhookService.processWebhookResult("PAYFAST", payload);
  assert.ok(dup.result?.duplicate || dup.duplicate || dup.result?.processed);
  const still = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  assert.strictEqual(still.state, "PAID");

  const mismatch = await webhookService.processWebhookResult("PAYFAST", {
    ...payload,
    amount: 99,
    externalEventId: `evt-mismatch-${intentId}`,
  });
  assert.ok(mismatch.httpStatus >= 400, "amount mismatch must fail");

  const unknown = await webhookService.processWebhookResult("PAYFAST", {
    valid: true,
    merchantReference: `EF-MISSING-${randomUUID().slice(0, 8)}`,
    gatewayTransactionId: "x",
    state: "PAID",
    amount: 10,
    externalEventId: `evt-unknown-${intentId}`,
    raw: {},
  });
  assert.ok(unknown.result?.noIntent || unknown.httpStatus === 200 || unknown.result?.processed);

  const invalid = await webhookService.processWebhookResult("PAYFAST", { valid: false });
  assert.strictEqual(invalid.httpStatus, 400);
}

async function run() {
  await testAckWaitsForProcessing();
  await testInvalidEventNoSuccessAck();
  await testTransientFailureNoAck();
  await testProcessWebhookIdempotency();
  console.log("payfastWebhook.http.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
