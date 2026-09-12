/**
 * Paystack webhook route + charge.success authority (no live HTTP).
 * Run: node tests/paystack.webhook.http.test.js
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
const { listenApp, httpRequest } = require("./helpers/httpServer");

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
    MARKETPLACE_SETTLEMENT_ENABLED: "true",
  };
}

function sign(body, secret = SECRET) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  return {
    raw,
    sig: crypto.createHmac("sha512", secret).update(raw).digest("hex"),
  };
}

function installFetchMock(router) {
  const calls = [];
  const previous = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || "GET").toUpperCase();
    if (!u.includes("api.paystack.co")) {
      return previous(url, opts);
    }
    calls.push({ url: u, method });
    if (typeof router === "function") return router(u, method, calls);
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  return {
    calls,
    restore() {
      global.fetch = previous;
    },
  };
}

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
  };
}

async function testRouteRejectsMissingAndTamperedSignature() {
  await withEnv(paystackEnv(), async () => {
    const app = require("../src/app");
    const h = await listenApp(app);
    try {
      const payload = { event: "charge.success", data: { reference: "EF-X", amount: 10000, status: "success" } };
      const raw = Buffer.from(JSON.stringify(payload));
      const missing = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/paystack", {
        headers: { "Content-Type": "application/json" },
        body: raw,
      });
      assert.ok(missing.status >= 400, "missing signature must be rejected");

      const tampered = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/paystack", {
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": "00".repeat(64),
        },
        body: raw,
      });
      assert.ok(tampered.status >= 400, "tampered signature must be rejected");
    } finally {
      await h.close();
    }
  });
}

async function testRouteRegisteredBeforeJsonParser() {
  await withEnv(paystackEnv(), async () => {
    const webhookService = require("../src/services/payments/webhook.service");
    const original = webhookService.handlePaystackWebhook;
    let sawBuffer = false;
    webhookService.handlePaystackWebhook = async (buf) => {
      sawBuffer = Buffer.isBuffer(buf);
      return { httpStatus: 200, result: { ok: true } };
    };
    const app = require("../src/app");
    const h = await listenApp(app);
    try {
      const { raw, sig } = sign({ event: "charge.success", data: { reference: "EF-RAW" } });
      const res = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/paystack", {
        headers: { "Content-Type": "application/json", "x-paystack-signature": sig },
        body: raw,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(sawBuffer, true, "controller must receive raw Buffer before express.json");
    } finally {
      webhookService.handlePaystackWebhook = original;
      await h.close();
    }
  });
}

async function seedMaterialIntent(suffix) {
  const prisma = require("../src/config/prisma");
  const customer = await prisma.user.create({
    data: {
      email: `ps.wh.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const supplierUser = await prisma.user.create({
    data: {
      email: `ps.wh.sup.${suffix}@example.com`,
      password: "x",
      name: "Supplier",
      role: "SUPPLIER",
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: supplierUser.id,
      name: `Supplier ${suffix}`,
      businessName: `Biz ${suffix}`,
    },
  });
  const branch = await prisma.branch.create({
    data: {
      id: randomUUID(),
      supplierId: supplier.id,
      name: `Branch ${suffix}`,
      address: "1 Test",
      products: [],
    },
  });
  await prisma.branchWithdrawalProfile.create({
    data: {
      id: randomUUID(),
      branchId: branch.id,
      bankName: "FNB",
      accountNumber: "enc:test",
      accountHolder: "Holder",
      branchCode: "enc:test",
      verificationStatus: "VERIFIED",
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: "ACCT_BRANCH",
      gatewayProfileStatus: "VERIFIED",
      isActive: true,
    },
  });
  const orderId = randomUUID();
  await prisma.materialOrder.create({
    data: {
      id: orderId,
      userId: customer.id,
      supplierId: supplier.id,
      branchId: branch.id,
      paymentStatus: "unpaid",
      materialsSubtotal: new Prisma.Decimal("100.00"),
      platformCommission: new Prisma.Decimal("7.00"),
      supplierEarning: new Prisma.Decimal("93.00"),
      payload: { items: [] },
    },
  });
  const merchantReference = `EF-WH-${suffix}`.toUpperCase();
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference,
      provider: "PAYSTACK",
      kind: "MATERIAL_ORDER",
      userId: customer.id,
      materialOrderId: orderId,
      amount: new Prisma.Decimal("100.00"),
      currency: "ZAR",
      state: "PENDING",
    },
  });
  return { customer, supplierUser, supplier, branch, orderId, intent };
}

async function cleanupMaterial(fix) {
  const prisma = require("../src/config/prisma");
  if (!fix) return;
  if (fix.intent?.id) {
    await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.paymentIntent.delete({ where: { id: fix.intent.id } }).catch(() => {});
  }
  if (fix.orderId) await prisma.materialOrder.delete({ where: { id: fix.orderId } }).catch(() => {});
  if (fix.branch?.id) {
    await prisma.branchWithdrawalProfile.deleteMany({ where: { branchId: fix.branch.id } }).catch(() => {});
    await prisma.branch.delete({ where: { id: fix.branch.id } }).catch(() => {});
  }
  if (fix.supplier?.id) await prisma.supplier.delete({ where: { id: fix.supplier.id } }).catch(() => {});
  if (fix.supplierUser?.id) await prisma.user.delete({ where: { id: fix.supplierUser.id } }).catch(() => {});
  if (fix.customer?.id) await prisma.user.delete({ where: { id: fix.customer.id } }).catch(() => {});
}

function verifyRouter(reference, { amount = 10000, currency = "ZAR", subaccount = "ACCT_BRANCH", status = "success" } = {}) {
  return (url, method) => {
    if (url.includes("/transaction/verify/") && method === "GET") {
      return jsonResponse({
        status: true,
        data: {
          id: 44001,
          status,
          reference,
          amount,
          currency,
          channel: "card",
          subaccount,
          fees: 449,
          fees_split: { paystack: 449, integration: 700, subaccount: 8851 },
          authorization: { authorization_code: "AUTH_SECRET", last4: "4242", brand: "visa", bin: "408408" },
          customer: { email: "hidden@example.test" },
        },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
}

async function postCharge(app, reference, extra = {}) {
  const payload = {
    event: "charge.success",
    data: {
      reference,
      status: "success",
      amount: extra.amount != null ? extra.amount : 10000,
      currency: extra.currency || "ZAR",
      id: extra.id || 44001,
      subaccount: extra.subaccount || {
        subaccount_code: "ACCT_BRANCH",
        account_number: "1234567890",
        settlement_bank: "Example Bank",
      },
      authorization: { authorization_code: "AUTH_SECRET", last4: "4242", brand: "visa" },
      customer: { email: "hidden@example.test" },
    },
  };
  const { raw, sig } = sign(payload);
  const h = await listenApp(app);
  try {
    return await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/paystack", {
      headers: { "Content-Type": "application/json", "x-paystack-signature": sig },
      body: raw,
    });
  } finally {
    await h.close();
  }
}

async function testChargeSuccessSettlesAndSanitizes() {
  const prisma = require("../src/config/prisma");
  const fix = await seedMaterialIntent(`${randomUUID().slice(0, 8)}ok`);
  const fetchMock = installFetchMock(verifyRouter(fix.intent.merchantReference));
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const res = await postCharge(app, fix.intent.merchantReference);
      assert.strictEqual(res.status, 200);
      assert.ok(fetchMock.calls.some((c) => c.url.includes("/transaction/verify/")));
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.state, "PAID");
      const payload = JSON.stringify(intent.gatewayPayload || {});
      assert.ok(!payload.includes("AUTH_SECRET"));
      assert.ok(!payload.includes("hidden@example.test"));
      assert.ok(!payload.includes("1234567890"));
      assert.ok(!payload.includes("Example Bank"));
      assert.strictEqual(intent.gatewayPayload.subaccount, "ACCT_BRANCH");
      const order = await prisma.materialOrder.findUnique({ where: { id: fix.orderId } });
      assert.strictEqual(order.paymentStatus, "paid");
    });
  } finally {
    fetchMock.restore();
    await cleanupMaterial(fix);
  }
}

async function testAmountAndCurrencyMismatchDoNotSettle() {
  const prisma = require("../src/config/prisma");
  const amountFix = await seedMaterialIntent(`${randomUUID().slice(0, 8)}am`);
  const currencyFix = await seedMaterialIntent(`${randomUUID().slice(0, 8)}cu`);
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const amountMock = installFetchMock(verifyRouter(amountFix.intent.merchantReference, { amount: 5000 }));
      try {
        const res = await postCharge(app, amountFix.intent.merchantReference);
        assert.ok(res.status >= 400);
        const intent = await prisma.paymentIntent.findUnique({ where: { id: amountFix.intent.id } });
        assert.strictEqual(intent.state, "PENDING");
      } finally {
        amountMock.restore();
      }

      const currencyMock = installFetchMock(
        verifyRouter(currencyFix.intent.merchantReference, { currency: "NGN" })
      );
      try {
        const res = await postCharge(app, currencyFix.intent.merchantReference, { currency: "NGN" });
        assert.ok(res.status >= 400);
        const intent = await prisma.paymentIntent.findUnique({ where: { id: currencyFix.intent.id } });
        assert.strictEqual(intent.state, "PENDING");
      } finally {
        currencyMock.restore();
      }
    });
  } finally {
    await cleanupMaterial(amountFix);
    await cleanupMaterial(currencyFix);
  }
}

async function testDuplicateChargeWebhookNoSecondLedger() {
  const prisma = require("../src/config/prisma");
  const fix = await seedMaterialIntent(`${randomUUID().slice(0, 8)}dp`);
  const fetchMock = installFetchMock(verifyRouter(fix.intent.merchantReference));
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const first = await postCharge(app, fix.intent.merchantReference, { id: 77 });
      const second = await postCharge(app, fix.intent.merchantReference, { id: 77 });
      assert.strictEqual(first.status, 200);
      assert.strictEqual(second.status, 200);
      const ledgers = await prisma.commissionLedger.findMany({
        where: { paymentIntentId: fix.intent.id },
      });
      assert.ok(ledgers.length <= 1);
      const events = await prisma.paymentWebhookEvent.findMany({
        where: { paymentIntentId: fix.intent.id },
      });
      assert.ok(events.length >= 1);
    });
  } finally {
    fetchMock.restore();
    await cleanupMaterial(fix);
  }
}

async function seedKindIntent(kind, suffix, extra = {}) {
  const prisma = require("../src/config/prisma");
  const customer = await prisma.user.create({
    data: {
      email: `ps.kind.cust.${suffix}@example.com`,
      password: "x",
      name: "Customer",
      role: "CUSTOMER",
    },
  });
  const providerUser = await prisma.user.create({
    data: {
      email: `ps.kind.prov.${suffix}@example.com`,
      password: "x",
      name: "Provider",
      role: "PROVIDER",
    },
  });
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      businessName: `Kind ${suffix}`,
      approved: true,
      profileCompleted: true,
    },
  });
  await prisma.providerWithdrawalProfile.create({
    data: {
      id: randomUUID(),
      providerId: provider.id,
      bankName: "FNB",
      accountNumber: "enc:test",
      accountHolder: "Prov",
      branchCode: "enc:test",
      verificationStatus: "VERIFIED",
      gatewayProvider: "PAYSTACK",
      gatewayRecipientId: extra.subaccount || "ACCT_PROV",
      gatewayProfileStatus: "VERIFIED",
      isActive: true,
    },
  });

  let job = null;
  let orderId = null;
  let deliveryRequestId = null;
  let repayment = null;
  const quoted = extra.quoted != null ? extra.quoted : 200;
  if (kind === "LABOR" || kind === "PROVIDER_REFUND_REPAYMENT" || kind === "DELIVERY_FEE" || kind === "JOB_STORE_ORDER") {
    job = await prisma.job.create({
      data: {
        title: `Kind job ${suffix}`,
        category: "plumbing",
        location: "Cape Town",
        description: "kind test",
        price: quoted,
        totalPrice: quoted,
        customerId: customer.id,
        providerId: providerUser.id,
        status: "IN_PROGRESS",
        paymentModeSnapshot: "TWO_PAYMENT_50_50",
        quotedAmount: quoted,
        firstPaymentAmount: quoted / 2,
        secondPaymentAmount: quoted / 2,
        paymentProgress: extra.paymentProgress || "NONE",
        meta: extra.jobMeta || { servicePrice: { amount: quoted } },
      },
    });
  }

  const amount = extra.amount != null ? extra.amount : kind === "LABOR" ? quoted / 2 : 100;
  const merchantReference = `EF-K-${suffix}`.toUpperCase();
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference,
      provider: "PAYSTACK",
      kind,
      paymentType: extra.paymentType || (kind === "LABOR" ? "DEPOSIT" : null),
      userId: extra.payerId || customer.id,
      jobId: job?.id || extra.jobId || null,
      materialOrderId: extra.materialOrderId || null,
      amount: new Prisma.Decimal(Number(amount).toFixed(2)),
      currency: "ZAR",
      state: extra.state || "PENDING",
      gatewayPayload: extra.gatewayPayload || {},
    },
  });
  return { customer, providerUser, provider, job, orderId, deliveryRequestId, repayment, intent, amount };
}

async function cleanupKind(fix) {
  const prisma = require("../src/config/prisma");
  if (!fix) return;
  if (fix.intent?.id) {
    await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.commissionLedger.deleteMany({ where: { paymentIntentId: fix.intent.id } }).catch(() => {});
    await prisma.paymentIntent.delete({ where: { id: fix.intent.id } }).catch(() => {});
  }
  if (fix.repayment?.id) {
    await prisma.providerRefundRepayment.delete({ where: { id: fix.repayment.id } }).catch(() => {});
  }
  if (fix.job?.id) {
    await prisma.commissionLedger.deleteMany({ where: { jobId: fix.job.id } }).catch(() => {});
    await prisma.job.delete({ where: { id: fix.job.id } }).catch(() => {});
  }
  if (fix.provider?.id) {
    await prisma.providerWithdrawalProfile.deleteMany({ where: { providerId: fix.provider.id } }).catch(() => {});
    await prisma.provider.delete({ where: { id: fix.provider.id } }).catch(() => {});
  }
  if (fix.providerUser?.id) await prisma.user.delete({ where: { id: fix.providerUser.id } }).catch(() => {});
  if (fix.customer?.id) await prisma.user.delete({ where: { id: fix.customer.id } }).catch(() => {});
}

async function testLaborDepositAndCompletion() {
  const prisma = require("../src/config/prisma");
  const deposit = await seedKindIntent("LABOR", `${randomUUID().slice(0, 8)}ld`, {
    paymentType: "DEPOSIT",
    quoted: 200,
    amount: 100,
  });
  const fetchMock = installFetchMock(
    verifyRouter(deposit.intent.merchantReference, { amount: 10000, subaccount: "ACCT_PROV" })
  );
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const res = await postCharge(app, deposit.intent.merchantReference, {
        amount: 10000,
        subaccount: "ACCT_PROV",
      });
      assert.strictEqual(res.status, 200, res.text);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: deposit.intent.id } });
      assert.strictEqual(intent.state, "PAID");
      assert.strictEqual(Number(intent.commissionAmount), 7);
      assert.strictEqual(Number(intent.recipientAmount), 93);
    });
  } finally {
    fetchMock.restore();
    await cleanupKind(deposit);
  }
}

async function testLaborCompletion() {
  const prisma = require("../src/config/prisma");
  const completion = await seedKindIntent("LABOR", `${randomUUID().slice(0, 8)}lc`, {
    paymentType: "COMPLETION",
    quoted: 200,
    amount: 100,
    paymentProgress: "FIRST_PAID",
    jobMeta: { servicePrice: { amount: 200 }, statusOverride: "AWAITING_CONFIRMATION" },
  });
  const fetchMock = installFetchMock(
    verifyRouter(completion.intent.merchantReference, { amount: 10000, subaccount: "ACCT_PROV" })
  );
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const res = await postCharge(app, completion.intent.merchantReference, {
        amount: 10000,
        subaccount: "ACCT_PROV",
      });
      assert.strictEqual(res.status, 200, res.text);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: completion.intent.id } });
      assert.strictEqual(intent.state, "PAID");
    });
  } finally {
    fetchMock.restore();
    await cleanupKind(completion);
  }
}

async function testJobStoreAndDeliveryKinds() {
  const prisma = require("../src/config/prisma");
  const storeFix = await seedMaterialIntent(`${randomUUID().slice(0, 8)}js`);
  await prisma.paymentIntent.update({
    where: { id: storeFix.intent.id },
    data: { kind: "JOB_STORE_ORDER" },
  });
  const storeMock = installFetchMock(verifyRouter(storeFix.intent.merchantReference));
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const res = await postCharge(app, storeFix.intent.merchantReference);
      assert.strictEqual(res.status, 200, res.text);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: storeFix.intent.id } });
      assert.strictEqual(intent.state, "PAID");
    });
  } finally {
    storeMock.restore();
    await cleanupMaterial(storeFix);
  }

  const delivery = await seedKindIntent("DELIVERY_FEE", `${randomUUID().slice(0, 8)}df`, {
    amount: 50,
    quoted: 200,
    gatewayPayload: {},
  });
  const drId = randomUUID();
  await prisma.deliveryRequest.create({
    data: {
      id: drId,
      customerId: delivery.customer.id,
      courierId: delivery.providerUser.id,
      category: "courier",
      items: [],
      collectionPoint: { address: "A" },
      destinationPoint: { address: "B" },
      status: "assigned",
    },
  });
  await prisma.paymentIntent.update({
    where: { id: delivery.intent.id },
    data: { amount: new Prisma.Decimal("50.00"), gatewayPayload: { deliveryRequestId: drId } },
  });
  const deliveryMock = installFetchMock(
    verifyRouter(delivery.intent.merchantReference, { amount: 5000, subaccount: "ACCT_PROV" })
  );
  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const res = await postCharge(app, delivery.intent.merchantReference, {
        amount: 5000,
        subaccount: "ACCT_PROV",
      });
      assert.ok(res.status === 200 || res.status === 500, res.text);
      const intent = await prisma.paymentIntent.findUnique({ where: { id: delivery.intent.id } });
      assert.strictEqual(intent.state, "PAID");
    });
  } finally {
    deliveryMock.restore();
    await prisma.deliveryRequest.delete({ where: { id: drId } }).catch(() => {});
    await cleanupKind(delivery);
  }
}

async function testRepaymentHasNoSplitAndMarksRecoveryOnce() {
  const prisma = require("../src/config/prisma");
  const refundRecovery = require("../src/services/refundRecovery.service");
  const suffix = `${randomUUID().slice(0, 8)}rp`;
  const fix = await seedKindIntent("PROVIDER_REFUND_REPAYMENT", suffix, {
    amount: 93,
    quoted: 200,
    payerId: null,
  });
  const providerUserId = fix.providerUser.id;
  await prisma.paymentIntent.update({
    where: { id: fix.intent.id },
    data: { userId: providerUserId },
  });
  const repayment = await prisma.providerRefundRepayment.create({
    data: {
      id: randomUUID(),
      providerId: fix.provider.id,
      jobId: fix.job.id,
      amount: new Prisma.Decimal("93.00"),
      status: "SUBMITTED",
      method: "GATEWAY",
      merchantReference: fix.intent.merchantReference,
      paymentIntentId: fix.intent.id,
      reference: `RR-${suffix}`,
    },
  });
  fix.repayment = repayment;

  let marked = 0;
  const original = refundRecovery.markGatewayRepaymentPaidFromIntent;
  refundRecovery.markGatewayRepaymentPaidFromIntent = async function wrapped(intent) {
    marked += 1;
    return original.call(this, intent);
  };

  const fetchMock = installFetchMock((url, method) => {
    if (url.includes("/transaction/verify/") && method === "GET") {
      return jsonResponse({
        status: true,
        data: {
          id: 88001,
          status: "success",
          reference: fix.intent.merchantReference,
          amount: 9300,
          currency: "ZAR",
          channel: "card",
        },
      });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });

  try {
    await withEnv(paystackEnv(), async () => {
      const app = require("../src/app");
      const payload = {
        event: "charge.success",
        data: {
          reference: fix.intent.merchantReference,
          status: "success",
          amount: 9300,
          currency: "ZAR",
          id: 88001,
        },
      };
      const { raw, sig } = sign(payload);
      const h = await listenApp(app);
      try {
        const first = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/paystack", {
          headers: { "Content-Type": "application/json", "x-paystack-signature": sig },
          body: raw,
        });
        const second = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/paystack", {
          headers: { "Content-Type": "application/json", "x-paystack-signature": sig },
          body: raw,
        });
        assert.strictEqual(first.status, 200, first.text);
        assert.strictEqual(second.status, 200);
      } finally {
        await h.close();
      }
      const intent = await prisma.paymentIntent.findUnique({ where: { id: fix.intent.id } });
      assert.strictEqual(intent.state, "PAID");
      assert.ok(!intent.gatewayPayload?.subaccount);
      assert.strictEqual(marked, 1);
    });
  } finally {
    refundRecovery.markGatewayRepaymentPaidFromIntent = original;
    fetchMock.restore();
    await cleanupKind(fix);
  }
}

async function main() {
  await testRouteRejectsMissingAndTamperedSignature();
  await testRouteRegisteredBeforeJsonParser();
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("placeholder")) {
    console.log("paystack.webhook.http.test.js: route tests passed (skip DB)");
    return;
  }
  await testChargeSuccessSettlesAndSanitizes();
  await testAmountAndCurrencyMismatchDoNotSettle();
  await testDuplicateChargeWebhookNoSecondLedger();
  await testLaborDepositAndCompletion();
  await testLaborCompletion();
  await testJobStoreAndDeliveryKinds();
  await testRepaymentHasNoSplitAndMarksRecoveryOnce();
  console.log("paystack.webhook.http.test.js: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
