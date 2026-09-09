/**
 * Browser return must not settle payment in production.
 * Run: node tests/confirmPaymentReturn.production.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { randomUUID } = require("crypto");
const { payfastSettleOnReturn } = require("../src/services/payments/paymentConfig");

async function testFlag() {
  assert.strictEqual(
    payfastSettleOnReturn({ NODE_ENV: "production", PAYFAST_MODE: "sandbox", PAYFAST_SETTLE_ON_RETURN: "true" }),
    false
  );
}

async function testConfirmReturnDoesNotPay() {
  if (!process.env.DATABASE_URL) {
    console.log("confirmPaymentReturn.production.test.js: skip DB (DATABASE_URL not set)");
    return;
  }
  const { Prisma } = require("@prisma/client");
  const prisma = require("../src/config/prisma");
  const paymentIntentService = require("../src/services/payments/paymentIntent.service");
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.PAYFAST_SETTLE_ON_RETURN = "true";
  process.env.PAYFAST_MODE = "sandbox";
  const merchantReference = `EF-RET-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const user =
    (await prisma.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } })) ||
    (await prisma.user.create({
      data: {
        email: `ret.${Date.now()}@example.com`,
        password: "x",
        name: "Return",
        role: "CUSTOMER",
      },
    }));
  const intent = await prisma.paymentIntent.create({
    data: {
      id: randomUUID(),
      merchantReference,
      provider: "PAYFAST",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      userId: user.id,
      amount: new Prisma.Decimal("20.00"),
      commissionAmount: new Prisma.Decimal("1.40"),
      recipientAmount: new Prisma.Decimal("18.60"),
      currency: "ZAR",
      state: "PENDING",
      escrowStatus: "NOT_APPLICABLE",
    },
  });
  try {
    const out = await paymentIntentService.confirmPaymentReturn(intent.id, user.id, "CUSTOMER");
    assert.notStrictEqual(out.intent.state, "PAID");
    const fresh = await prisma.paymentIntent.findUnique({ where: { id: intent.id } });
    assert.notStrictEqual(fresh.state, "PAID");
  } finally {
    process.env.NODE_ENV = prev;
    delete process.env.PAYFAST_SETTLE_ON_RETURN;
  }
}

async function run() {
  await testFlag();
  await testConfirmReturnDoesNotPay();
  console.log("confirmPaymentReturn.production.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");

runTestMain(run);
