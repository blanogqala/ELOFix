/**
 * Paystack async refund lifecycle (no live HTTP).
 * Run: node tests/paystack.refund.lifecycle.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-file-access-secret-key";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const assert = require("assert");
const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");

const SECRET = "sk_test_unit_not_a_real_key";

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const key of keys) prev[key] = process.env[key];
  const restore = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(restore);
}

function paystackEnv() {
  return {
    PAYSTACK_MODE: "test",
    PAYSTACK_SECRET_KEY: SECRET,
    PAYSTACK_PUBLIC_KEY: "pk_test_unit_not_a_real_key",
    ENABLED_PAYMENT_PROVIDERS: "paystack",
  };
}

function sign(body) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    raw,
    sig: crypto.createHmac("sha512", SECRET).update(raw).digest("hex"),
  };
}

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
  };
}

function installFetchMock(router) {
  const calls = [];
  const previous = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || "GET").toUpperCase();
    let parsed = null;
    if (opts.body) parsed = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
    calls.push({ url: u, method, body: parsed });
    if (typeof router === "function") return router(u, method, parsed, calls);
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  return {
    calls,
    restore() {
      global.fetch = previous;
    },
  };
}

async function seedPaidLabor(suffix, { amount = 100, refundedAmount = 0, jobMeta = {} } = {}) {
  const prisma = require("../src/config/prisma");
  const customer = await prisma.user.create({
    data: {
      email: `ps.rf.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `ps.rf.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Refund ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `Refund job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "refund lifecycle",
      price: 200,
      totalPrice: 200,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "IN_PROGRESS",
      laborPaid: true,
      paymentModeSnapshot: "TWO_PAYMENT_50_50",
      quotedAmount: 200,
      firstPaymentAmount: 100,
      secondPaymentAmount: 100,
      paymentProgress: "FIRST_PAID",
      meta: {
        servicePrice: { amount: 200 },
        refund: {
          pendingRefund: 93,
          customerRefundStatus: "REFUND_PROCESSING",
          ...jobMeta,
        },
      },
    },
  });
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-RF-${suffix}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "DEPOSIT",
      userId: customer.id,
      jobId: job.id,
      amount: new Prisma.Decimal(Number(amount).toFixed(2)),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      refundedAmount: new Prisma.Decimal(Number(refundedAmount).toFixed(2)),
      gatewayTransactionId: `tx-${suffix}`,
      gatewayPayload: {},
    },
  });
  return { customer, providerUser, provider, job, intent };
}

async function cleanup(fix) {
  const prisma = require("../src/config/prisma");
  if (!fix) return;
  if (fix.job?.id) {
    await prisma.invoice.deleteMany({ where: { jobId: fix.job.id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { jobId: fix.job.id } }).catch(() => {});
  }
  if (fix.intent?.id) {
    await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.paymentIntent.delete({ where: { id: fix.intent.id } }).catch(() => {});
  }
  if (fix.secondIntent?.id) {
    await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: fix.secondIntent.id } }).catch(() => {});
    await prisma.paymentIntent.delete({ where: { id: fix.secondIntent.id } }).catch(() => {});
  }
  if (fix.job?.id) {
    await prisma.commissionLedger.deleteMany({ where: { jobId: fix.job.id } }).catch(() => {});
    await prisma.job.delete({ where: { id: fix.job.id } }).catch(() => {});
  }
  if (fix.provider?.id) {
    await prisma.refundRecovery.deleteMany({ where: { providerId: fix.provider.id } }).catch(() => {});
    await prisma.provider.delete({ where: { id: fix.provider.id } }).catch(() => {});
  }
  if (fix.providerUser?.id) await prisma.user.delete({ where: { id: fix.providerUser.id } }).catch(() => {});
  if (fix.customer?.id) await prisma.user.delete({ where: { id: fix.customer.id } }).catch(() => {});
}

async function testPendingDoesNotFinalize() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}pd`);
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  let notified = 0;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 18237078, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const out = await refundService.requestGatewayRefund(fix.intent.id, 93, {
        idempotencyKey: "test-pending",
      });
      assert.strictEqual(out.ok, false);
      assert.strictEqual(out.pending, true);
      assert.strictEqual(out.status, "PENDING");
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.state, "PAID");
      assert.strictEqual(Number(intent.refundedAmount), 0);
      assert.strictEqual(intent.refundedAt, null);
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "18237078");
      assert.strictEqual(Number(intent.gatewayPayload.pendingRefund.requestedAmount), 93);
      const invoices = await prisma.invoice.findMany({ where: { jobId: fix.job.id } });
      assert.strictEqual(invoices.length, 0);
      assert.strictEqual(notified, 0);

      const reuse = await refundService.requestGatewayRefund(fix.intent.id, 93);
      assert.strictEqual(reuse.reusedPending, true);
      assert.strictEqual(fetchMock.calls.filter((c) => c.method === "POST").length, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function postRefundEvent(event, data) {
  const webhookService = require("../src/services/payments/webhook.service");
  const payload = { event, data };
  const { raw, sig } = sign(payload);
  return webhookService.handlePaystackWebhook(raw, sig);
}

async function testRefundProcessingNeedsAttentionFailedProcessed() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}lc`);
  let processedNotify = 0;
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    processedNotify += 1;
  };

  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 99, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/99") && method === "GET") {
      const latest = fetchMock.latestVerifyStatus || "processing";
      return jsonResponse({
        status: true,
        data: { id: 99, status: latest, amount: 9300, currency: "ZAR", transaction: { reference: fix.intent.merchantReference } },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });

  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);

      fetchMock.latestVerifyStatus = "processing";
      const processing = await postRefundEvent("refund.processing", {
        id: 99,
        status: "processing",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(processing.httpStatus, 200);
      let intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.state, "PAID");
      assert.strictEqual(Number(intent.refundedAmount), 0);

      fetchMock.latestVerifyStatus = "needs-attention";
      const needs = await postRefundEvent("refund.needs-attention", {
        id: 99,
        status: "needs-attention",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(needs.httpStatus, 200);
      intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 0);
      assert.strictEqual(intent.gatewayPayload.pendingRefund.status, "NEEDS_ATTENTION");
      let job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
      assert.strictEqual(job.meta.refund.actionRequired, true);

      fetchMock.latestVerifyStatus = "failed";
      const failed = await postRefundEvent("refund.failed", {
        id: 99,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(failed.httpStatus, 200);
      intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 0);
      assert.ok(!intent.gatewayPayload.pendingRefund);
      job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_FAILED");

      await refundService.requestGatewayRefund(fix.intent.id, 93);
      fetchMock.latestVerifyStatus = "processed";
      const processed = await postRefundEvent("refund.processed", {
        id: 99,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(processed.httpStatus, 200, processed.message);
      intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      assert.strictEqual(intent.state, "PARTIALLY_REFUNDED");
      assert.ok(intent.refundedAt);
      assert.ok(!intent.gatewayPayload.pendingRefund);
      job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      const invoices = await prisma.invoice.findMany({ where: { jobId: fix.job.id } });
      assert.strictEqual(invoices.length, 1);
      assert.strictEqual(Number(invoices[0].payload.totalAmount), 93);
      assert.strictEqual(processedNotify, 1);

      const dup = await postRefundEvent("refund.processed", {
        id: 99,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(dup.httpStatus, 200);
      intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      const invoicesAfter = await prisma.invoice.findMany({ where: { jobId: fix.job.id } });
      assert.strictEqual(invoicesAfter.length, 1);
      assert.strictEqual(processedNotify, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testStagedPendingKeepsCustomerProcessing() {
  const refundRecovery = require("../src/services/refundRecovery.service");
  const prisma = require("../src/config/prisma");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}st`);
  let stagedNotify = 0;
  let processedNotify = 0;
  const originalStaged = notificationEvents.notifyCustomerStagedRefundPayout;
  const originalProcessed = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerStagedRefundPayout = async () => {
    stagedNotify += 1;
  };
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    processedNotify += 1;
  };
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 55, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/55") && method === "GET") {
      return jsonResponse({
        status: true,
        data: {
          id: 55,
          status: "processed",
          amount: 9300,
          currency: "ZAR",
          transaction: { reference: fix.intent.merchantReference },
        },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundRecovery.processStagedCustomerPayouts([
        { jobId: fix.job.id, customerId: fix.customer.id, amount: 93 },
      ]);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 0);
      assert.strictEqual(intent.gatewayPayload.pendingRefund.status, "PENDING");
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 93);
      assert.strictEqual(stagedNotify, 0);
      const invoices = await prisma.invoice.findMany({ where: { jobId: fix.job.id } });
      assert.strictEqual(invoices.length, 0);

      const webhookService = require("../src/services/payments/webhook.service");
      const { raw, sig } = sign({
        event: "refund.processed",
        data: {
          id: 55,
          status: "processed",
          amount: 9300,
          currency: "ZAR",
          transaction_reference: fix.intent.merchantReference,
        },
      });
      const out = await webhookService.handlePaystackWebhook(raw, sig);
      assert.strictEqual(out.httpStatus, 200, out.message);
      const after = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(after.refundedAmount), 93);
      assert.strictEqual(after.state, "PARTIALLY_REFUNDED");
      assert.strictEqual(processedNotify, 1);
    });
  } finally {
    notificationEvents.notifyCustomerStagedRefundPayout = originalStaged;
    notificationEvents.notifyCustomerRefundProcessed = originalProcessed;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testFifoStopsOnPending() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}ff`);
  const second = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-RF2-${randomUUID().slice(0, 8)}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "COMPLETION",
      userId: fix.customer.id,
      jobId: fix.job.id,
      amount: new Prisma.Decimal("100.00"),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(Date.now() + 1000),
      refundedAmount: new Prisma.Decimal("0"),
      gatewayTransactionId: "tx-second",
    },
  });
  fix.secondIntent = second;
  const refundedTx = [];
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      refundedTx.push(body?.transaction);
      return jsonResponse({
        status: true,
        data: { id: 1, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const out = await refundService.refundJobLaborAcrossIntents(fix.job.id, 186);
      assert.strictEqual(out.ok, false);
      assert.strictEqual(out.pending, true);
      assert.strictEqual(refundedTx.length, 1);
      assert.strictEqual(refundedTx[0], fix.intent.gatewayTransactionId);
      const secondFresh = await prisma.paymentIntent.findUnique({ where: { id: second.id } });
      assert.ok(!secondFresh.gatewayPayload?.pendingRefund);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function main() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("placeholder")) {
    console.log("paystack.refund.lifecycle.test.js: skip DB");
    return;
  }
  await testPendingDoesNotFinalize();
  await testRefundProcessingNeedsAttentionFailedProcessed();
  await testStagedPendingKeepsCustomerProcessing();
  await testFifoStopsOnPending();
  console.log("paystack.refund.lifecycle.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
