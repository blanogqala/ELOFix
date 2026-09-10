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

function mockPayfastValidate(bodyText) {
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes("payfast.co.za")) {
      return { ok: true, status: 200, text: async () => bodyText };
    }
    return originalFetch(url, opts);
  };
  return () => {
    global.fetch = originalFetch;
  };
}

function signedItn(fields, passphrase) {
  const payfast = require("../src/services/payments/payfast.gateway");
  const data = { ...fields };
  data.signature = payfast.buildItnSignature(data, passphrase);
  return data;
}

async function withEnv(overrides, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(overrides)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function testHostedNotifyUrlGeneration() {
  const payfast = require("../src/services/payments/payfast.gateway");
  await withEnv(
    {
      PAYMENT_BASE_URL: "https://elofix-6136.onrender.com",
      FRONTEND_BASE_URL: "https://elofix.co.za",
      PAYFAST_NOTIFY_URL: undefined,
      PAYFAST_RETURN_URL: undefined,
      PAYFAST_CANCEL_URL: undefined,
      PAYFAST_MERCHANT_ID: "10000100",
      PAYFAST_MERCHANT_KEY: "test-key",
      PAYFAST_PASSPHRASE: "elofix-test-salt",
      PAYFAST_MODE: "sandbox",
    },
    () => {
      const checkout = payfast.createCheckout(
        {
          id: "intent-hosted-notify",
          merchantReference: "EF-NOTIFY",
          amount: 50,
          kind: "LABOR",
        },
        { name: "Customer A", email: "staging.customer.a@elofix.test" }
      );
      assert.strictEqual(
        checkout.formFields.notify_url,
        "https://elofix-6136.onrender.com/api/payments/webhooks/payfast"
      );
      assert.strictEqual(
        checkout.formFields.return_url,
        "https://elofix.co.za/payments/return?intentId=intent-hosted-notify"
      );
      assert.strictEqual(
        checkout.formFields.cancel_url,
        "https://elofix.co.za/payments/cancel?intentId=intent-hosted-notify"
      );
      assert.strictEqual(typeof checkout.formFields.signature, "string");
      assert.strictEqual(checkout.formFields.signature.length, 32);
    }
  );

  await withEnv(
    {
      PAYMENT_BASE_URL: "https://example.invalid",
      PAYFAST_NOTIFY_URL: "https://elofix-6136.onrender.com/api/payments/webhooks/payfast",
      PAYFAST_MERCHANT_ID: "10000100",
      PAYFAST_MERCHANT_KEY: "test-key",
      PAYFAST_PASSPHRASE: "",
    },
    () => {
      const checkout = payfast.createCheckout(
        {
          id: "intent-explicit-notify",
          merchantReference: "EF-NOTIFY-2",
          amount: 50,
          kind: "LABOR",
          returnUrl: "https://elofix.co.za/payments/return?intentId=intent-explicit-notify",
          cancelUrl: "https://elofix.co.za/payments/cancel?intentId=intent-explicit-notify",
        },
        { name: "Customer A", email: "staging.customer.a@elofix.test" }
      );
      assert.strictEqual(
        checkout.formFields.notify_url,
        "https://elofix-6136.onrender.com/api/payments/webhooks/payfast"
      );
    }
  );
}

async function captureWebhookClientIp(app, headers) {
  const webhookService = require("../src/services/payments/webhook.service");
  const original = webhookService.handlePayfastWebhook;
  let seenIp = null;
  webhookService.handlePayfastWebhook = async (_data, clientIp) => {
    seenIp = clientIp;
    return { httpStatus: 400, message: "Invalid webhook" };
  };
  const h = await listenApp(app);
  try {
    await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
      form: { m_payment_id: "EF-IP", payment_status: "COMPLETE" },
      headers,
    });
    return seenIp;
  } finally {
    webhookService.handlePayfastWebhook = original;
    await h.close();
  }
}

async function testRenderOriginalClientIpHttp() {
  const payfast = require("../src/services/payments/payfast.gateway");
  const prevRender = process.env.RENDER;
  const prevSkip = process.env.PAYFAST_SKIP_IP_CHECK;
  const prevNode = process.env.NODE_ENV;
  process.env.RENDER = "true";
  process.env.PAYFAST_SKIP_IP_CHECK = "false";
  process.env.NODE_ENV = "production";
  const app = require("../src/app");
  const prevTrust = app.get("trust proxy");
  app.set("trust proxy", 1);
  try {
    const resolved = await captureWebhookClientIp(app, {
      "cf-connecting-ip": "197.97.145.150",
      "x-forwarded-for": "197.97.145.150, 172.71.146.175",
    });
    assert.strictEqual(String(resolved), "197.97.145.150");
    assert.strictEqual(payfast.isPayfastIp(resolved), true);

    const malformedCf = await captureWebhookClientIp(app, {
      "cf-connecting-ip": "not-an-ip",
      "x-forwarded-for": "197.97.145.150, 172.71.146.175",
    });
    assert.strictEqual(String(malformedCf), "197.97.145.150");

    const mapped = await captureWebhookClientIp(app, {
      "cf-connecting-ip": "::ffff:197.97.145.150",
    });
    assert.strictEqual(String(mapped), "197.97.145.150");

    const random = await captureWebhookClientIp(app, {
      "cf-connecting-ip": "8.8.8.8",
    });
    assert.strictEqual(String(random), "8.8.8.8");
    assert.strictEqual(payfast.isPayfastIp(random), false);
  } finally {
    app.set("trust proxy", prevTrust);
    if (prevRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = prevRender;
    if (prevSkip === undefined) delete process.env.PAYFAST_SKIP_IP_CHECK;
    else process.env.PAYFAST_SKIP_IP_CHECK = prevSkip;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
}

async function testNonRenderForwardedHeadersCannotOverride() {
  const prevRender = process.env.RENDER;
  delete process.env.RENDER;
  const app = require("../src/app");
  const prevTrust = app.get("trust proxy");
  try {
    app.set("trust proxy", false);
    const seen = await captureWebhookClientIp(app, {
      "cf-connecting-ip": "197.97.145.150",
      "x-forwarded-for": "197.97.145.150, 172.71.146.175",
    });
    assert.ok(
      !String(seen).includes("197.97.145.150"),
      `non-Render must not honor forwarded PayFast IP headers, got ${seen}`
    );
  } finally {
    app.set("trust proxy", prevTrust);
    if (prevRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = prevRender;
  }
}

async function testTrustedProxyAndSpoofedForwardedFor() {
  const prevRender = process.env.RENDER;
  delete process.env.RENDER;
  const app = require("../src/app");
  const prevTrust = app.get("trust proxy");
  try {
    app.set("trust proxy", 1);
    const trusted = await captureWebhookClientIp(app, { "x-forwarded-for": "197.97.145.150" });
    assert.ok(
      String(trusted).includes("197.97.145.150"),
      `trusted proxy must resolve originating IP, got ${trusted}`
    );

    app.set("trust proxy", false);
    const spoofed = await captureWebhookClientIp(app, { "x-forwarded-for": "197.97.145.150" });
    assert.ok(
      !String(spoofed).includes("197.97.145.150"),
      `spoofed X-Forwarded-For must not become client IP, got ${spoofed}`
    );
  } finally {
    app.set("trust proxy", prevTrust);
    if (prevRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = prevRender;
  }
}

async function testItnVerificationHttp() {
  const passphrase = "itn-test-passphrase";
  const payfastIp = "197.97.145.150";
  await withEnv(
    {
      PAYFAST_PASSPHRASE: passphrase,
      PAYFAST_SKIP_IP_CHECK: "false",
      RENDER: undefined,
      NODE_ENV: "test",
    },
    async () => {
      const app = require("../src/app");
      const prevTrust = app.get("trust proxy");
      app.set("trust proxy", 1);
      const h = await listenApp(app);
      const restoreFetch = mockPayfastValidate("VALID");
      try {
        const validForm = signedItn(
          {
            m_payment_id: `EF-ITN-${randomUUID().slice(0, 8)}`,
            pf_payment_id: `pf-${Date.now()}`,
            payment_status: "COMPLETE",
            amount_gross: "50.00",
            amount: "50.00",
          },
          passphrase
        );
        const valid = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form: validForm,
          headers: { "x-forwarded-for": payfastIp },
        });
        assert.strictEqual(valid.status, 200, "valid ITN must ACK");

        const badSig = {
          ...validForm,
          signature: "deadbeefdeadbeefdeadbeefdeadbeef",
        };
        const invalidSig = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form: badSig,
          headers: { "x-forwarded-for": payfastIp },
        });
        assert.ok(invalidSig.status >= 400, "invalid signature must not ACK 200");

        const invalidIp = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form: validForm,
          headers: { "x-forwarded-for": "8.8.8.8" },
        });
        assert.ok(invalidIp.status >= 400, "invalid PayFast source IP must not ACK 200");

        const restoreInvalid = mockPayfastValidate("INVALID");
        const serverFail = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form: signedItn(
            {
              m_payment_id: `EF-ITN-SV-${randomUUID().slice(0, 8)}`,
              pf_payment_id: `pf-sv-${Date.now()}`,
              payment_status: "COMPLETE",
              amount_gross: "50.00",
            },
            passphrase
          ),
          headers: { "x-forwarded-for": payfastIp },
        });
        assert.ok(serverFail.status >= 400, "PayFast server validation failure must not ACK 200");
        restoreInvalid();
      } finally {
        restoreFetch();
        app.set("trust proxy", prevTrust);
        await h.close();
      }
    }
  );
}

async function testValidItnSettlesOnceAndWrongAmountFails() {
  if (!process.env.DATABASE_URL) {
    console.log("payfastWebhook.http.test.js: skip live ITN settle (DATABASE_URL not set)");
    return;
  }
  const passphrase = "itn-test-passphrase";
  const { Prisma } = require("@prisma/client");
  const prisma = require("../src/config/prisma");
  const merchantReference = `EF-ITN-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const intentId = randomUUID();
  const user =
    (await prisma.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } })) ||
    (await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `itn.${Date.now()}@example.com`,
        password: "x",
        name: "ITN",
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

  await withEnv(
    {
      PAYFAST_PASSPHRASE: passphrase,
      PAYFAST_SKIP_IP_CHECK: "false",
      RENDER: undefined,
      NODE_ENV: "test",
    },
    async () => {
      const app = require("../src/app");
      const prevTrust = app.get("trust proxy");
      app.set("trust proxy", 1);
      const h = await listenApp(app);
      const restoreFetch = mockPayfastValidate("VALID");
      try {
        const form = signedItn(
          {
            m_payment_id: merchantReference,
            pf_payment_id: `pf-${intentId.slice(0, 8)}`,
            payment_status: "COMPLETE",
            amount_gross: "50.00",
          },
          passphrase
        );
        const first = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form,
          headers: { "x-forwarded-for": "102.216.36.10" },
        });
        assert.strictEqual(first.status, 200);
        const paid = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
        assert.strictEqual(paid.state, "PAID");

        const dup = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form,
          headers: { "x-forwarded-for": "102.216.36.10" },
        });
        assert.strictEqual(dup.status, 200);
        const still = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
        assert.strictEqual(still.state, "PAID");
        const intentCount = await prisma.paymentIntent.count({ where: { merchantReference } });
        assert.strictEqual(intentCount, 1);

        const wrong = signedItn(
          {
            m_payment_id: merchantReference,
            pf_payment_id: `pf-wrong-${intentId.slice(0, 8)}`,
            payment_status: "COMPLETE",
            amount_gross: "99.00",
          },
          passphrase
        );
        const mismatch = await httpRequest(h.baseUrl, "POST", "/api/payments/webhooks/payfast", {
          form: wrong,
          headers: { "x-forwarded-for": "102.216.36.10" },
        });
        assert.ok(mismatch.status >= 400, "wrong amount must fail");
      } finally {
        restoreFetch();
        app.set("trust proxy", prevTrust);
        await h.close();
      }
    }
  );
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
  await testHostedNotifyUrlGeneration();
  await testAckWaitsForProcessing();
  await testInvalidEventNoSuccessAck();
  await testTransientFailureNoAck();
  await testTrustedProxyAndSpoofedForwardedFor();
  await testRenderOriginalClientIpHttp();
  await testNonRenderForwardedHeadersCannotOverride();
  await testItnVerificationHttp();
  await testValidItnSettlesOnceAndWrongAmountFails();
  await testProcessWebhookIdempotency();
  console.log("payfastWebhook.http.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
