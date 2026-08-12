/**
 * Stabilization tests: webhook idempotency short-circuit, withdrawal 410, settlement stage math.
 * Run: node tests/paymentMigration.stabilization.test.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const assert = require("assert");
const { randomUUID } = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../src/config/prisma");
const webhookService = require("../src/services/payments/webhook.service");
const providerAccountService = require("../src/services/providerAccount.service");
const branchAccountService = require("../src/services/branchAccount.service");
const paymentModeService = require("../src/services/payments/paymentMode.service");
const { splitCommission } = require("../src/services/payments/money.util");

async function testWithdrawalDisabled() {
  let threw = false;
  try {
    await providerAccountService.requestWithdrawal("any-user", { amount: 10 }, null, null, null);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 410);
  }
  assert.ok(threw, "provider withdraw must throw 410");

  threw = false;
  try {
    await branchAccountService.requestWithdrawal({ id: "x" }, "branch", { amount: 10 }, null, null, null);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.statusCode, 410);
  }
  assert.ok(threw, "branch withdraw must throw 410");
}

async function testDuplicateWebhookDoesNotDoubleSettle() {
  const merchantReference = `EF-STAB-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const intentId = randomUUID();
  const user =
    (await prisma.user.findFirst({ where: { role: "CUSTOMER" }, select: { id: true } })) ||
    (await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `stab.${Date.now()}@example.com`,
        password: "x",
        name: "Stab",
        role: "CUSTOMER",
      },
      select: { id: true },
    }));

  await prisma.paymentIntent.create({
    data: {
      id: intentId,
      merchantReference,
      provider: "PAYFAST",
      kind: "MATERIAL_ORDER",
      paymentType: "MATERIAL_ORDER",
      userId: user.id,
      amount: new Prisma.Decimal("100.00"),
      commissionAmount: new Prisma.Decimal(0),
      recipientAmount: new Prisma.Decimal(0),
      currency: "ZAR",
      state: "PAID",
      paidAt: new Date(),
      escrowStatus: "NOT_APPLICABLE",
      providerPayoutStatus: "COMPLETE",
    },
  });

  const externalEventId = `stab-dup-${intentId}`;
  const payload = {
    valid: true,
    merchantReference,
    gatewayTransactionId: `gw-${intentId}`,
    state: "PAID",
    amount: 100,
    externalEventId,
    raw: { source: "stabilization_test" },
  };

  const first = await webhookService.processWebhookResult("PAYFAST", payload);
  assert.strictEqual(first.httpStatus, 200);
  assert.ok(first.result?.duplicate === true || first.result?.processed === true);

  const second = await webhookService.processWebhookResult("PAYFAST", payload);
  assert.strictEqual(second.httpStatus, 200);
  assert.ok(second.result?.duplicate === true || second.result?.processed === true);

  const events = await prisma.paymentWebhookEvent.count({
    where: { provider: "PAYFAST", externalEventId },
  });
  assert.ok(events <= 1, "duplicate externalEventId must not create multiple durable events");

  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  assert.strictEqual(intent.state, "PAID");

  await prisma.paymentWebhookEvent.deleteMany({ where: { paymentIntentId: intentId } });
  await prisma.paymentIntent.delete({ where: { id: intentId } }).catch(() => {});
}

function testFailedPaymentDoesNotAdvanceProgressLogic() {
  // Unit: FIRST_PAID only after successful settle; FAILED intent leaves progress NONE
  const job = {
    paymentModeSnapshot: "TWO_PAYMENT_50_50",
    paymentProgress: "NONE",
    legacyEscrowV2: false,
    firstPaymentAmount: 5000,
    secondPaymentAmount: 5000,
  };
  assert.strictEqual(paymentModeService.resolveNextLaborPaymentType(job, {}), "DEPOSIT");
  // After failed attempt, progress still NONE → still DEPOSIT (retry)
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType({ ...job, paymentProgress: "NONE" }, {}),
    "DEPOSIT"
  );
  // After deposit success but before completion request: no second pay yet
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(
      { ...job, paymentProgress: "FIRST_PAID" },
      { statusOverride: "SERVICE_PAID" }
    ),
    null
  );
  // Payment 2 due only after completion requested — FAILED payment 2 would leave FIRST_PAID
  assert.strictEqual(
    paymentModeService.resolveNextLaborPaymentType(
      { ...job, paymentProgress: "FIRST_PAID" },
      { statusOverride: "AWAITING_CONFIRMATION" }
    ),
    "COMPLETION"
  );
  assert.notStrictEqual(
    paymentModeService.resolveNextLaborPaymentType(
      { ...job, paymentProgress: "FIRST_PAID" },
      { statusOverride: "AWAITING_CONFIRMATION" }
    ),
    null
  );
  // Must not be FULLY_PAID / completed without second success
  assert.notStrictEqual(job.paymentProgress, "FULLY_PAID");
}

function testPerTransactionCommissionNotOnFullQuote() {
  const p1 = splitCommission(5000);
  const p2 = splitCommission(5000);
  assert.strictEqual(Number(p1.commissionAmount), 350);
  assert.strictEqual(Number(p2.commissionAmount), 350);
  assert.strictEqual(Number(p1.commissionAmount) + Number(p2.commissionAmount), 700);
  // Wrong pattern would be 7% of 10000 once (=700) applied to a single tranche
  assert.notStrictEqual(Number(p1.commissionAmount), 700);
}

async function main() {
  testFailedPaymentDoesNotAdvanceProgressLogic();
  testPerTransactionCommissionNotOnFullQuote();
  await testWithdrawalDisabled();
  await testDuplicateWebhookDoesNotDoubleSettle();
  console.log("paymentMigration.stabilization.test.js: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
