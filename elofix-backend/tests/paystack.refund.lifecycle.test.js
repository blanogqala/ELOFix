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

async function testProcessedUsesStoredPendingRefundId() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}fb`);
  const storedId = "18237078";
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  let notified = 0;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: Number(storedId), status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes(`/refund/${storedId}`) && method === "GET") {
      return jsonResponse({
        status: true,
        data: {
          id: Number(storedId),
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
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const out = await postRefundEvent("refund.processed", {
        id: undefined,
        refund_reference: null,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      assert.ok(fetchMock.calls.some((c) => c.method === "GET" && c.url.includes(`/refund/${storedId}`)));
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      assert.ok(intent.gatewayPayload.finalizedRefundIds.includes(storedId));
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.strictEqual(notified, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testWebhookRefundIdContradictionIsRejected() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}mm`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 111, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/") && method === "GET") {
      throw new Error("verify must not run on identity mismatch");
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const out = await postRefundEvent("refund.processed", {
        id: 999,
        refund_reference: "999",
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 400);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 0);
      assert.strictEqual(intent.state, "PAID");
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "111");
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testTwoRefundsSameIntentHaveDistinctEventIds() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}tw`);
  let postCount = 0;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      postCount += 1;
      const id = postCount === 1 ? 201 : 202;
      const amount = id === 201 ? 9300 : 700;
      return jsonResponse({
        status: true,
        data: { id, status: "pending", amount, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/201") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 201, status: "processed", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/202") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 202, status: "processed", amount: 700, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93, { idempotencyKey: "slice-a" });
      const first = await postRefundEvent("refund.processed", {
        id: 201,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(first.httpStatus, 200, first.message);
      await refundService.requestGatewayRefund(fix.intent.id, 7, { idempotencyKey: "slice-b" });
      const second = await postRefundEvent("refund.processed", {
        id: 202,
        status: "processed",
        amount: 700,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(second.httpStatus, 200, second.message);
      const events = await prisma.paymentWebhookEvent.findMany({
        where: {
          provider: "PAYSTACK",
          externalEventId: { in: ["paystack-refund:201:refund.processed", "paystack-refund:202:refund.processed"] },
        },
      });
      assert.strictEqual(events.length, 2);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 100);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testCrashRetryDoesNotDoubleIncrement() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}cr`);
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  let notified = 0;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 777, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/777") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 777, status: "processed", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const first = await postRefundEvent("refund.processed", {
        id: 777,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(first.httpStatus, 200, first.message);
      await prisma.paymentWebhookEvent.updateMany({
        where: { provider: "PAYSTACK", externalEventId: "paystack-refund:777:refund.processed" },
        data: { processedAt: null, processingError: null },
      });
      const retry = await postRefundEvent("refund.processed", {
        id: 777,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(retry.httpStatus, 200, retry.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      const invoices = await prisma.invoice.findMany({ where: { jobId: fix.job.id } });
      assert.strictEqual(invoices.length, 1);
      assert.strictEqual(notified, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testFifoContinuationAfterFirstProcessed() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}fc`, {
    jobMeta: { pendingRefund: 186, customerRefundStatus: "REFUND_PROCESSING" },
  });
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
      gatewayTransactionId: "tx-second-fifo",
      gatewayPayload: {},
    },
  });
  fix.secondIntent = second;
  let notified = 0;
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  let nextId = 5001;
  const posted = [];
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      const id = nextId++;
      posted.push({ id, transaction: body?.transaction, amount: body?.amount });
      return jsonResponse({
        status: true,
        data: { id, status: "pending", amount: body?.amount, currency: "ZAR" },
      });
    }
    const match = String(url).match(/\/refund\/(\d+)/);
    if (match && method === "GET") {
      const id = Number(match[1]);
      const row = posted.find((p) => p.id === id);
      return jsonResponse({
        status: true,
        data: { id, status: "processed", amount: row?.amount || 10000, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const started = await refundService.refundJobLaborAcrossIntents(fix.job.id, 186);
      assert.strictEqual(started.pending, true);
      assert.strictEqual(posted.length, 1);
      assert.strictEqual(posted[0].transaction, fix.intent.gatewayTransactionId);
      const firstProcessed = await postRefundEvent("refund.processed", {
        refund_reference: null,
        status: "processed",
        amount: posted[0].amount,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(firstProcessed.httpStatus, 200, firstProcessed.message);
      const firstIntent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(firstIntent.refundedAmount), 100);
      let job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
      assert.ok(!job.meta.refund.completedAt);
      assert.strictEqual(notified, 0);
      assert.strictEqual(posted.length, 2);
      assert.strictEqual(posted[1].transaction, second.gatewayTransactionId);
      const secondFresh = await prisma.paymentIntent.findUnique({ where: { id: second.id } });
      assert.strictEqual(secondFresh.gatewayPayload.pendingRefund.externalRefundId, String(posted[1].id));

      const secondProcessed = await postRefundEvent("refund.processed", {
        id: posted[1].id,
        status: "processed",
        amount: posted[1].amount,
        currency: "ZAR",
        transaction_reference: second.merchantReference,
      });
      assert.strictEqual(secondProcessed.httpStatus, 200, secondProcessed.message);
      job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.ok(job.meta.refund.completedAt);
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      assert.strictEqual(notified, 1);
      const completion = await prisma.paymentIntent.findUnique({ where: { id: second.id } });
      assert.strictEqual(Number(completion.refundedAmount), 86);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testUnpaidCompletionIsNotRefunded() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}uc`);
  const unpaid = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference: `EF-UN-${randomUUID().slice(0, 8)}`.toUpperCase(),
      provider: "PAYSTACK",
      kind: "LABOR",
      paymentType: "COMPLETION",
      userId: fix.customer.id,
      jobId: fix.job.id,
      amount: new Prisma.Decimal("100.00"),
      currency: "ZAR",
      state: "PENDING",
      refundedAmount: new Prisma.Decimal("0"),
      gatewayPayload: {},
    },
  });
  fix.secondIntent = unpaid;
  const posted = [];
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      posted.push(body?.transaction);
      return jsonResponse({
        status: true,
        data: { id: 606, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/606") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 606, status: "processed", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.refundJobLaborAcrossIntents(fix.job.id, 93);
      const out = await postRefundEvent("refund.processed", {
        id: 606,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      assert.strictEqual(posted.length, 1);
      assert.strictEqual(posted[0], fix.intent.gatewayTransactionId);
      const completion = await prisma.paymentIntent.findUnique({ where: { id: unpaid.id } });
      assert.strictEqual(completion.state, "PENDING");
      assert.strictEqual(Number(completion.refundedAmount), 0);
      assert.ok(!completion.gatewayPayload?.pendingRefund);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testRefundGetAmountAndCurrencyMismatch() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const amountFix = await seedPaidLabor(`${randomUUID().slice(0, 8)}am`);
  const currencyFix = await seedPaidLabor(`${randomUUID().slice(0, 8)}cu`);
  let postCount = 0;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      postCount += 1;
      const id = postCount === 1 ? 801 : 802;
      return jsonResponse({
        status: true,
        data: { id, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/801") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 801, status: "processed", amount: 5000, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/802") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 802, status: "processed", amount: 9300, currency: "USD" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(amountFix.intent.id, 93);
      const amountOut = await postRefundEvent("refund.processed", {
        id: 801,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: amountFix.intent.merchantReference,
      });
      assert.strictEqual(amountOut.httpStatus, 400);
      const amountIntent = await prisma.paymentIntent.findUnique({ where: { id: amountFix.intent.id } });
      assert.strictEqual(Number(amountIntent.refundedAmount), 0);

      await refundService.requestGatewayRefund(currencyFix.intent.id, 93);
      const currencyOut = await postRefundEvent("refund.processed", {
        id: 802,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: currencyFix.intent.merchantReference,
      });
      assert.strictEqual(currencyOut.httpStatus, 400);
      const currencyIntent = await prisma.paymentIntent.findUnique({ where: { id: currencyFix.intent.id } });
      assert.strictEqual(Number(currencyIntent.refundedAmount), 0);
    });
  } finally {
    fetchMock.restore();
    await cleanup(amountFix);
    await cleanup(currencyFix);
  }
}

async function testCrashAfterMoneyThenResumeArtifacts() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}cm`);
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  let notified = 0;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  let crashOnce = true;
  refundService.setRefundFinalizationTestHook("afterApplyIntentRefundMoney", async () => {
    if (!crashOnce) return;
    crashOnce = false;
    throw new Error("test_crash_after_refund_money");
  });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 888, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/888") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 888, status: "processed", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const first = await postRefundEvent("refund.processed", {
        id: 888,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(first.httpStatus, 500, first.message);
      let intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      assert.ok(intent.gatewayPayload.finalizedRefundIds.includes("888"));
      let job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 93);
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
      assert.strictEqual((await prisma.invoice.findMany({ where: { jobId: fix.job.id } })).length, 0);
      assert.strictEqual(notified, 0);
      const ev = await prisma.paymentWebhookEvent.findUnique({
        where: { provider_externalEventId: { provider: "PAYSTACK", externalEventId: "paystack-refund:888:refund.processed" } },
      });
      assert.ok(ev);
      assert.strictEqual(ev.processedAt, null);

      const retry = await postRefundEvent("refund.processed", {
        id: 888,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(retry.httpStatus, 200, retry.message);
      intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      assert.strictEqual((await prisma.invoice.findMany({ where: { jobId: fix.job.id } })).length, 1);
      assert.strictEqual(notified, 1);
      const evAfter = await prisma.paymentWebhookEvent.findUnique({
        where: { provider_externalEventId: { provider: "PAYSTACK", externalEventId: "paystack-refund:888:refund.processed" } },
      });
      assert.ok(evAfter.processedAt);
    });
  } finally {
    refundService.setRefundFinalizationTestHook("afterApplyIntentRefundMoney", null);
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testCrashAfterMoneyOmittedWebhookId() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}co`);
  const storedId = "18237079";
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  let notified = 0;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  let crashOnce = true;
  refundService.setRefundFinalizationTestHook("afterApplyIntentRefundMoney", async () => {
    if (!crashOnce) return;
    crashOnce = false;
    throw new Error("test_crash_after_refund_money_omitted_id");
  });
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: Number(storedId), status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes(`/refund/${storedId}`) && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: Number(storedId), status: "processed", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  const omitted = {
    refund_reference: null,
    status: "processed",
    amount: 9300,
    currency: "ZAR",
    transaction_reference: null,
  };
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      omitted.transaction_reference = fix.intent.merchantReference;
      const first = await postRefundEvent("refund.processed", omitted);
      assert.strictEqual(first.httpStatus, 500, first.message);
      const afterCrash = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(afterCrash.refundedAmount), 93);
      assert.ok(!afterCrash.gatewayPayload.pendingRefund);

      const retry = await postRefundEvent("refund.processed", {
        refund_reference: null,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(retry.httpStatus, 200, retry.message);
      assert.notStrictEqual(retry.message, "Refund identity missing");
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.strictEqual(notified, 1);
    });
  } finally {
    refundService.setRefundFinalizationTestHook("afterApplyIntentRefundMoney", null);
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testFailedRetryWithoutRefundId() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}fl`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 4041, status: "pending", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/4041") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 4041, status: "failed", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const first = await postRefundEvent("refund.failed", {
        id: 4041,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(first.httpStatus, 200, first.message);
      const after = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(after.refundedAmount), 0);
      assert.ok(!after.gatewayPayload.pendingRefund);
      assert.strictEqual(after.gatewayPayload.lastRefundAttempt.externalRefundId, "4041");

      const retry = await postRefundEvent("refund.failed", {
        refund_reference: null,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(retry.httpStatus, 200, retry.message);
      assert.notStrictEqual(retry.message, "Refund identity missing");
      const again = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(again.refundedAmount), 0);
      assert.ok(!again.gatewayPayload.pendingRefund);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testOldRefundRetryDoesNotStealNewPending() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}ab`);
  let postCount = 0;
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      postCount += 1;
      const id = postCount === 1 ? 701 : 702;
      const amount = id === 701 ? 9300 : 700;
      return jsonResponse({
        status: true,
        data: { id, status: "pending", amount, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/701") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 701, status: "processed", amount: 9300, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/702") && method === "GET") {
      throw new Error("must not verify or finalize pending refund B from old A retry");
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93, { idempotencyKey: "slice-a" });
      const processed = await postRefundEvent("refund.processed", {
        id: 701,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(processed.httpStatus, 200, processed.message);
      await refundService.requestGatewayRefund(fix.intent.id, 7, { idempotencyKey: "slice-b" });
      const stale = await postRefundEvent("refund.processed", {
        refund_reference: null,
        status: "processed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.ok(stale.httpStatus === 200 || stale.result?.ignored, stale.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "702");
      assert.strictEqual(Number(intent.gatewayPayload.pendingRefund.requestedAmount), 7);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testFifoContinuationTransientFailureThenRetry() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}ft`, {
    jobMeta: { pendingRefund: 186, customerRefundStatus: "REFUND_PROCESSING" },
  });
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
      gatewayTransactionId: "tx-second-fifo-retry",
      gatewayPayload: {},
    },
  });
  fix.secondIntent = second;
  let notified = 0;
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  let nextId = 6101;
  const posted = [];
  let failNextPostOnce = false;
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      if (posted.length === 1 && !failNextPostOnce) {
        failNextPostOnce = true;
        return jsonResponse({ status: false, message: "paystack_unavailable" }, 500);
      }
      const id = nextId++;
      posted.push({ id, transaction: body?.transaction, amount: body?.amount });
      return jsonResponse({
        status: true,
        data: { id, status: "pending", amount: body?.amount, currency: "ZAR" },
      });
    }
    const match = String(url).match(/\/refund\/(\d+)/);
    if (match && method === "GET") {
      const id = Number(match[1]);
      const row = posted.find((p) => p.id === id);
      return jsonResponse({
        status: true,
        data: { id, status: "processed", amount: row?.amount || 10000, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const started = await refundService.refundJobLaborAcrossIntents(fix.job.id, 186);
      assert.strictEqual(started.pending, true);
      assert.strictEqual(posted.length, 1);
      const firstProcessed = await postRefundEvent("refund.processed", {
        id: posted[0].id,
        status: "processed",
        amount: posted[0].amount,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(firstProcessed.httpStatus, 500, firstProcessed.message);
      const firstIntent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(firstIntent.refundedAmount), 100);
      let job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
      assert.ok(Number(job.meta.refund.pendingRefund) > 0);
      assert.ok(!job.meta.refund.completedAt);
      assert.strictEqual(notified, 0);
      let secondFresh = await prisma.paymentIntent.findUnique({ where: { id: second.id } });
      assert.ok(!secondFresh.gatewayPayload?.pendingRefund);

      const retry = await postRefundEvent("refund.processed", {
        id: posted[0].id,
        status: "processed",
        amount: posted[0].amount,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(retry.httpStatus, 200, retry.message);
      const firstAgain = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(firstAgain.refundedAmount), 100);
      secondFresh = await prisma.paymentIntent.findUnique({ where: { id: second.id } });
      assert.ok(secondFresh.gatewayPayload.pendingRefund);
      assert.strictEqual(posted.length, 2);

      const secondProcessed = await postRefundEvent("refund.processed", {
        id: posted[1].id,
        status: "processed",
        amount: posted[1].amount,
        currency: "ZAR",
        transaction_reference: second.merchantReference,
      });
      assert.strictEqual(secondProcessed.httpStatus, 200, secondProcessed.message);
      job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.strictEqual(notified, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
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

async function seedFailedThenPending(fix, refundService, { aId, bId, aAmount = 93, bAmount = 7 }) {
  await refundService.requestGatewayRefund(fix.intent.id, aAmount, { idempotencyKey: "stale-a" });
  const failed = await postRefundEvent("refund.failed", {
    id: aId,
    status: "failed",
    amount: Math.round(aAmount * 100),
    currency: "ZAR",
    transaction_reference: fix.intent.merchantReference,
  });
  assert.strictEqual(failed.httpStatus, 200, failed.message);
  await refundService.requestGatewayRefund(fix.intent.id, bAmount, { idempotencyKey: "live-b" });
}

async function testStaleFailedWithoutIdDoesNotStealPendingB() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s1`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      const id = fetchMock.calls.filter((c) => c.method === "POST").length <= 1 ? 801 : 802;
      const amount = id === 801 ? 9300 : 700;
      return jsonResponse({ status: true, data: { id, status: "pending", amount, currency: "ZAR" } });
    }
    if (url.includes("/refund/801") && method === "GET") {
      return jsonResponse({ status: true, data: { id: 801, status: "failed", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/802") && method === "GET") {
      throw new Error("must not verify pending B for stale A failed retry");
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await seedFailedThenPending(fix, refundService, { aId: 801, bId: 802 });
      const before = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      const jobBefore = await prisma.job.findUnique({ where: { id: fix.job.id } });
      const stale = await postRefundEvent("refund.failed", {
        refund_reference: null,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(stale.httpStatus, 200, stale.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "802");
      assert.strictEqual(Number(intent.gatewayPayload.pendingRefund.requestedAmount), 7);
      assert.notStrictEqual(String(intent.gatewayPayload.pendingRefund.status || "").toUpperCase(), "FAILED");
      assert.strictEqual(
        intent.gatewayPayload.pendingRefund.status,
        before.gatewayPayload.pendingRefund.status
      );
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, jobBefore.meta.refund.customerRefundStatus);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testExplicitOldFailedIdIsStaleNot400() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s2`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      const id = url.includes("never") ? 0 : fetchMock.calls.filter((c) => c.method === "POST").length <= 1 ? 811 : 812;
      const amount = id === 811 ? 9300 : 700;
      return jsonResponse({ status: true, data: { id, status: "pending", amount, currency: "ZAR" } });
    }
    if (url.includes("/refund/811") && method === "GET") {
      return jsonResponse({ status: true, data: { id: 811, status: "failed", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/812") && method === "GET") {
      throw new Error("must not verify pending B for explicit stale A id");
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await seedFailedThenPending(fix, refundService, { aId: 811, bId: 812 });
      const stale = await postRefundEvent("refund.failed", {
        id: 811,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(stale.httpStatus, 200, stale.message);
      assert.notStrictEqual(stale.message, "Refund identity mismatch");
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "812");
      assert.strictEqual(Number(intent.gatewayPayload.pendingRefund.requestedAmount), 7);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testSameAmountFailedRetryWithoutIdIsAmbiguous() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s3`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      const n = fetchMock.calls.filter((c) => c.method === "POST").length;
      const id = n <= 1 ? 821 : 822;
      return jsonResponse({ status: true, data: { id, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/821") && method === "GET") {
      return jsonResponse({ status: true, data: { id: 821, status: "failed", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/822") && method === "GET") {
      throw new Error("ambiguous stale A must not bind to B");
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await seedFailedThenPending(fix, refundService, { aId: 821, bId: 822, aAmount: 93, bAmount: 93 });
      const stale = await postRefundEvent("refund.failed", {
        refund_reference: null,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(stale.httpStatus, 200, stale.message);
      assert.ok(stale.result?.ignored || stale.result?.duplicate || stale.result?.stale);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "822");
      assert.strictEqual(Number(intent.gatewayPayload.pendingRefund.requestedAmount), 93);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testFailedEventKeepsPendingWhenVerifyPending() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s4`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({ status: true, data: { id: 831, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/831") && method === "GET") {
      return jsonResponse({ status: true, data: { id: 831, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const out = await postRefundEvent("refund.failed", {
        id: 831,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.ok(intent.gatewayPayload.pendingRefund);
      assert.strictEqual(intent.gatewayPayload.pendingRefund.externalRefundId, "831");
      assert.notStrictEqual(String(intent.gatewayPayload.pendingRefund.status || "").toUpperCase(), "FAILED");
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testFailedEventUsesCompletedVerify() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s5`);
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {};
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({ status: true, data: { id: 841, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/841") && method === "GET") {
      return jsonResponse({ status: true, data: { id: 841, status: "processed", amount: 9300, currency: "ZAR" } });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const out = await postRefundEvent("refund.failed", {
        id: 841,
        status: "failed",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(Number(intent.refundedAmount), 93);
      assert.ok(!intent.gatewayPayload.pendingRefund);
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.notStrictEqual(job.meta.refund.customerRefundStatus, "REFUND_FAILED");
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testNeedsAttentionEventKeepsPendingWhenVerifyPending() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s6`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({ status: true, data: { id: 851, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/851") && method === "GET") {
      return jsonResponse({ status: true, data: { id: 851, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const out = await postRefundEvent("refund.needs-attention", {
        id: 851,
        status: "needs-attention",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.ok(intent.gatewayPayload.pendingRefund);
      assert.notStrictEqual(intent.gatewayPayload.pendingRefund.status, "NEEDS_ATTENTION");
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.notStrictEqual(job.meta.refund.actionRequired, true);
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_PROCESSING");
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testNeedsAttentionConfirmedByVerify() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const fix = await seedPaidLabor(`${randomUUID().slice(0, 8)}s7`);
  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({ status: true, data: { id: 861, status: "pending", amount: 9300, currency: "ZAR" } });
    }
    if (url.includes("/refund/861") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 861, status: "needs-attention", amount: 9300, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.requestGatewayRefund(fix.intent.id, 93);
      const out = await postRefundEvent("refund.needs-attention", {
        id: 861,
        status: "needs-attention",
        amount: 9300,
        currency: "ZAR",
        transaction_reference: fix.intent.merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.gatewayPayload.pendingRefund.status, "NEEDS_ATTENTION");
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(job.meta.refund.actionRequired, true);
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
  await testProcessedUsesStoredPendingRefundId();
  await testWebhookRefundIdContradictionIsRejected();
  await testTwoRefundsSameIntentHaveDistinctEventIds();
  await testCrashRetryDoesNotDoubleIncrement();
  await testFifoContinuationAfterFirstProcessed();
  await testUnpaidCompletionIsNotRefunded();
  await testRefundGetAmountAndCurrencyMismatch();
  await testCrashAfterMoneyThenResumeArtifacts();
  await testCrashAfterMoneyOmittedWebhookId();
  await testFailedRetryWithoutRefundId();
  await testOldRefundRetryDoesNotStealNewPending();
  await testFifoContinuationTransientFailureThenRetry();
  await testStaleFailedWithoutIdDoesNotStealPendingB();
  await testExplicitOldFailedIdIsStaleNot400();
  await testSameAmountFailedRetryWithoutIdIsAmbiguous();
  await testFailedEventKeepsPendingWhenVerifyPending();
  await testFailedEventUsesCompletedVerify();
  await testNeedsAttentionEventKeepsPendingWhenVerifyPending();
  await testNeedsAttentionConfirmedByVerify();
  console.log("paystack.refund.lifecycle.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
