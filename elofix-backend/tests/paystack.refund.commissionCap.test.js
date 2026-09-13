/**
 * Paystack customer-refund 7% commission protection.
 * Run: node tests/paystack.refund.commissionCap.test.js
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

async function postRefundEvent(event, data) {
  const webhookService = require("../src/services/payments/webhook.service");
  const payload = { event, data };
  const { raw, sig } = sign(payload);
  return webhookService.handlePaystackWebhook(raw, sig);
}

async function seedLaborJob(suffix, { pendingRefund, intents }) {
  const prisma = require("../src/config/prisma");
  const customer = await prisma.user.create({
    data: {
      email: `ps.cap.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `ps.cap.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Cap ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `Cap job ${suffix}`,
      category: "plumbing",
      location: "Cape Town",
      description: "commission cap",
      price: 250 * intents.length,
      totalPrice: 250 * intents.length,
      customerId: customer.id,
      providerId: providerUser.id,
      status: "IN_PROGRESS",
      laborPaid: true,
      paymentModeSnapshot: "TWO_PAYMENT_50_50",
      quotedAmount: 250 * intents.length,
      firstPaymentAmount: 250,
      secondPaymentAmount: intents.length > 1 ? 250 : 0,
      paymentProgress: intents.length > 1 ? "FULLY_PAID" : "FIRST_PAID",
      meta: {
        servicePrice: { amount: 250 * intents.length },
        refund: {
          pendingRefund,
          immediateRefund: 0,
          customerRefundStatus: "REFUND_PROCESSING",
        },
      },
    },
  });
  const created = [];
  for (const spec of intents) {
    created.push(
      await prisma.paymentIntent.create({
        data: {
          id: randomUUID(),
          merchantReference: spec.merchantReference,
          provider: "PAYSTACK",
          kind: spec.kind || "LABOR",
          paymentType: spec.paymentType,
          userId: customer.id,
          jobId: job.id,
          amount: new Prisma.Decimal(Number(spec.amount).toFixed(2)),
          currency: "ZAR",
          state: spec.state || "PAID",
          paidAt: spec.state === "PENDING" ? null : spec.paidAt || new Date(),
          refundedAmount: new Prisma.Decimal(Number(spec.refundedAmount || 0).toFixed(2)),
          commissionAmount: new Prisma.Decimal(Number(spec.commissionAmount).toFixed(2)),
          recipientAmount: new Prisma.Decimal(Number(spec.recipientAmount).toFixed(2)),
          gatewayTransactionId: spec.gatewayTransactionId || null,
          gatewayPayload: spec.gatewayPayload || {},
        },
      })
    );
  }
  return { customer, providerUser, provider, job, intents: created };
}

async function cleanup(fix) {
  const prisma = require("../src/config/prisma");
  if (!fix) return;
  if (fix.job?.id) {
    await prisma.invoice.deleteMany({ where: { jobId: fix.job.id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { jobId: fix.job.id } }).catch(() => {});
  }
  for (const intent of fix.intents || []) {
    await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: intent.id } }).catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { paymentIntentId: intent.id } }).catch(() => {});
    await prisma.paymentIntent.delete({ where: { id: intent.id } }).catch(() => {});
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

function refundInvoices(rows) {
  return rows.filter((row) => {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    return String(p.type || "") === "refund";
  });
}

async function testSingleTrancheDoesNotRefundCommission() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const suffix = randomUUID().slice(0, 8);
  const fix = await seedLaborJob(`${suffix}s1`, {
    pendingRefund: 232.5,
    intents: [
      {
        merchantReference: `EF-CAP-${suffix}`.toUpperCase(),
        paymentType: "DEPOSIT",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        gatewayTransactionId: `tx-cap-${suffix}`,
      },
    ],
  });
  let notified = 0;
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  const posted = [];
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      posted.push(body);
      return jsonResponse({
        status: true,
        data: { id: 91001, status: "pending", amount: body?.amount, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/91001") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 91001, status: "processed", amount: 23250, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const started = await refundService.refundJobLaborAcrossIntents(fix.job.id, 232.5);
      assert.strictEqual(started.pending, true);
      assert.strictEqual(posted.length, 1);
      assert.strictEqual(posted[0].amount, 23250);

      await prisma.job.update({
        where: { id: fix.job.id },
        data: {
          meta: {
            ...fix.job.meta,
            refund: {
              ...fix.job.meta.refund,
              gatewayRefundRefs: ["91001"],
              customerRefundStatus: "REFUND_PROCESSING",
              pendingRefund: 232.5,
              immediateRefund: 0,
            },
          },
        },
      });

      const processed = await postRefundEvent("refund.processed", {
        id: 91001,
        status: "processed",
        amount: 23250,
        currency: "ZAR",
        transaction_reference: fix.intents[0].merchantReference,
      });
      assert.strictEqual(processed.httpStatus, 200, processed.message);
      assert.strictEqual(posted.length, 1, "must not POST a second /refund");
      assert.ok(!posted.some((row) => Number(row.amount) === 1750));

      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intents[0].id } });
      assert.strictEqual(Number(intent.refundedAmount), 232.5);
      assert.strictEqual(intent.state, "PARTIALLY_REFUNDED");

      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      assert.strictEqual(Number(job.meta.refund.immediateRefund), 232.5);
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.ok(job.meta.refund.completedAt);
      assert.ok(job.meta.refund.customerNotifiedAt);
      assert.deepStrictEqual(job.meta.refund.gatewayRefundRefs, ["91001"]);
      assert.deepStrictEqual(job.meta.refund.finalizedGatewayRefundRefs, ["91001"]);

      const invoices = refundInvoices(await prisma.invoice.findMany({ where: { jobId: fix.job.id } }));
      assert.strictEqual(invoices.length, 1);
      assert.strictEqual(Number(invoices[0].payload.totalAmount), 232.5);
      assert.strictEqual(notified, 1);

      const leftover = await refundService.requestGatewayRefund(intent.id, 17.5);
      assert.strictEqual(leftover.message, "nothing_left_to_refund");
      assert.strictEqual(posted.length, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testPendingRefDoesNotCountAsFinalized() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const suffix = randomUUID().slice(0, 8);
  const fix = await seedLaborJob(`${suffix}s2`, {
    pendingRefund: 232.5,
    intents: [
      {
        merchantReference: `EF-CAP2-${suffix}`.toUpperCase(),
        paymentType: "DEPOSIT",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        gatewayTransactionId: `tx-cap2-${suffix}`,
      },
    ],
  });
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {};
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      return jsonResponse({
        status: true,
        data: { id: 91002, status: "pending", amount: body?.amount, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/91002") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 91002, status: "processed", amount: 23250, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.refundJobLaborAcrossIntents(fix.job.id, 232.5);
      await prisma.job.update({
        where: { id: fix.job.id },
        data: {
          meta: {
            ...fix.job.meta,
            refund: {
              pendingRefund: 232.5,
              immediateRefund: 0,
              customerRefundStatus: "REFUND_PROCESSING",
              gatewayRefundRefs: ["91002"],
            },
          },
        },
      });
      const processed = await postRefundEvent("refund.processed", {
        id: 91002,
        status: "processed",
        amount: 23250,
        currency: "ZAR",
        transaction_reference: fix.intents[0].merchantReference,
      });
      assert.strictEqual(processed.httpStatus, 200, processed.message);
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      assert.strictEqual(Number(job.meta.refund.immediateRefund), 232.5);
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");
      assert.deepStrictEqual(job.meta.refund.finalizedGatewayRefundRefs, ["91002"]);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testDuplicateProcessedIsIdempotent() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const suffix = randomUUID().slice(0, 8);
  const fix = await seedLaborJob(`${suffix}s3`, {
    pendingRefund: 232.5,
    intents: [
      {
        merchantReference: `EF-CAP3-${suffix}`.toUpperCase(),
        paymentType: "DEPOSIT",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        gatewayTransactionId: `tx-cap3-${suffix}`,
      },
    ],
  });
  let notified = 0;
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {
    notified += 1;
  };
  const posted = [];
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      posted.push(body);
      return jsonResponse({
        status: true,
        data: { id: 91003, status: "pending", amount: body?.amount, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/91003") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 91003, status: "processed", amount: 23250, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.refundJobLaborAcrossIntents(fix.job.id, 232.5);
      const first = await postRefundEvent("refund.processed", {
        id: 91003,
        status: "processed",
        amount: 23250,
        currency: "ZAR",
        transaction_reference: fix.intents[0].merchantReference,
      });
      assert.strictEqual(first.httpStatus, 200, first.message);
      const dup = await postRefundEvent("refund.processed", {
        id: 91003,
        status: "processed",
        amount: 23250,
        currency: "ZAR",
        transaction_reference: fix.intents[0].merchantReference,
      });
      assert.strictEqual(dup.httpStatus, 200, dup.message);
      assert.strictEqual(posted.length, 1);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intents[0].id } });
      assert.strictEqual(Number(intent.refundedAmount), 232.5);
      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      assert.strictEqual(Number(job.meta.refund.immediateRefund), 232.5);
      const invoices = refundInvoices(await prisma.invoice.findMany({ where: { jobId: fix.job.id } }));
      assert.strictEqual(invoices.length, 1);
      assert.strictEqual(notified, 1);
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testTwoPaidTranchesNeverRefundCommission() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const notificationEvents = require("../src/services/notificationEvents.service");
  const suffix = randomUUID().slice(0, 8);
  const fix = await seedLaborJob(`${suffix}s4`, {
    pendingRefund: 465,
    intents: [
      {
        merchantReference: `EF-CAP4A-${suffix}`.toUpperCase(),
        paymentType: "DEPOSIT",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        gatewayTransactionId: `tx-cap4a-${suffix}`,
        paidAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        merchantReference: `EF-CAP4B-${suffix}`.toUpperCase(),
        paymentType: "COMPLETION",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        gatewayTransactionId: `tx-cap4b-${suffix}`,
        paidAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
  });
  const originalNotify = notificationEvents.notifyCustomerRefundProcessed;
  notificationEvents.notifyCustomerRefundProcessed = async () => {};
  const posted = [];
  let nextId = 92001;
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
        data: { id, status: "processed", amount: row?.amount || 23250, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      const started = await refundService.refundJobLaborAcrossIntents(fix.job.id, 465);
      assert.strictEqual(started.pending, true);
      assert.strictEqual(posted.length, 1);
      assert.strictEqual(posted[0].amount, 23250);
      assert.strictEqual(posted[0].transaction, fix.intents[0].gatewayTransactionId);

      const first = await postRefundEvent("refund.processed", {
        id: posted[0].id,
        status: "processed",
        amount: posted[0].amount,
        currency: "ZAR",
        transaction_reference: fix.intents[0].merchantReference,
      });
      assert.strictEqual(first.httpStatus, 200, first.message);
      assert.strictEqual(posted.length, 2);
      assert.strictEqual(posted[1].amount, 23250);
      assert.strictEqual(posted[1].transaction, fix.intents[1].gatewayTransactionId);

      const second = await postRefundEvent("refund.processed", {
        id: posted[1].id,
        status: "processed",
        amount: posted[1].amount,
        currency: "ZAR",
        transaction_reference: fix.intents[1].merchantReference,
      });
      assert.strictEqual(second.httpStatus, 200, second.message);
      assert.strictEqual(posted.length, 2);
      assert.ok(!posted.some((row) => Number(row.amount) === 1750));

      const deposit = await prisma.paymentIntent.findUnique({ where: { id: fix.intents[0].id } });
      const completion = await prisma.paymentIntent.findUnique({ where: { id: fix.intents[1].id } });
      assert.strictEqual(Number(deposit.refundedAmount), 232.5);
      assert.strictEqual(deposit.state, "PARTIALLY_REFUNDED");
      assert.strictEqual(Number(completion.refundedAmount), 232.5);
      assert.strictEqual(completion.state, "PARTIALLY_REFUNDED");

      const job = await prisma.job.findUnique({ where: { id: fix.job.id } });
      assert.strictEqual(Number(job.meta.refund.pendingRefund), 0);
      assert.strictEqual(Number(job.meta.refund.immediateRefund), 465);
      assert.strictEqual(job.meta.refund.customerRefundStatus, "REFUND_COMPLETED");

      const invoices = refundInvoices(await prisma.invoice.findMany({ where: { jobId: fix.job.id } }));
      assert.strictEqual(invoices.length, 2);
      assert.ok(invoices.every((row) => Number(row.payload.totalAmount) === 232.5));
    });
  } finally {
    notificationEvents.notifyCustomerRefundProcessed = originalNotify;
    fetchMock.restore();
    await cleanup(fix);
  }
}

async function testUnpaidCompletionUntouched() {
  const prisma = require("../src/config/prisma");
  const refundService = require("../src/services/payments/refund.service");
  const suffix = randomUUID().slice(0, 8);
  const fix = await seedLaborJob(`${suffix}s5`, {
    pendingRefund: 232.5,
    intents: [
      {
        merchantReference: `EF-CAP5A-${suffix}`.toUpperCase(),
        paymentType: "DEPOSIT",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        gatewayTransactionId: `tx-cap5a-${suffix}`,
      },
      {
        merchantReference: `EF-CAP5B-${suffix}`.toUpperCase(),
        paymentType: "COMPLETION",
        amount: 250,
        commissionAmount: 17.5,
        recipientAmount: 232.5,
        state: "PENDING",
      },
    ],
  });
  const posted = [];
  const fetchMock = installFetchMock((url, method, body) => {
    if (url.includes("/refund") && method === "POST") {
      posted.push(body?.transaction);
      return jsonResponse({
        status: true,
        data: { id: 91005, status: "pending", amount: body?.amount, currency: "ZAR" },
      });
    }
    if (url.includes("/refund/91005") && method === "GET") {
      return jsonResponse({
        status: true,
        data: { id: 91005, status: "processed", amount: 23250, currency: "ZAR" },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  try {
    await withEnv(paystackEnv(), async () => {
      await refundService.refundJobLaborAcrossIntents(fix.job.id, 232.5);
      const out = await postRefundEvent("refund.processed", {
        id: 91005,
        status: "processed",
        amount: 23250,
        currency: "ZAR",
        transaction_reference: fix.intents[0].merchantReference,
      });
      assert.strictEqual(out.httpStatus, 200, out.message);
      assert.strictEqual(posted.length, 1);
      assert.strictEqual(posted[0], fix.intents[0].gatewayTransactionId);
      const unpaid = await prisma.paymentIntent.findUnique({ where: { id: fix.intents[1].id } });
      assert.strictEqual(unpaid.state, "PENDING");
      assert.strictEqual(Number(unpaid.refundedAmount), 0);
    });
  } finally {
    fetchMock.restore();
    await cleanup(fix);
  }
}

function testMaterialOrderCeilingUnchanged() {
  const { remainingRefundableOnIntent } = require("../src/services/payments/refund.service");
  assert.strictEqual(
    remainingRefundableOnIntent({
      kind: "MATERIAL_ORDER",
      amount: 250,
      commissionAmount: 17.5,
      recipientAmount: 232.5,
      refundedAmount: 0,
    }),
    250
  );
  assert.strictEqual(
    remainingRefundableOnIntent({
      kind: "MATERIAL_ORDER",
      amount: 250,
      refundedAmount: 40,
    }),
    210
  );
}

async function main() {
  testMaterialOrderCeilingUnchanged();
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("placeholder")) {
    console.log("paystack.refund.commissionCap.test.js: unit OK, skip DB");
    return;
  }
  await testSingleTrancheDoesNotRefundCommission();
  await testPendingRefDoesNotCountAsFinalized();
  await testDuplicateProcessedIsIdempotent();
  await testTwoPaidTranchesNeverRefundCommission();
  await testUnpaidCompletionUntouched();
  console.log("paystack.refund.commissionCap.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
