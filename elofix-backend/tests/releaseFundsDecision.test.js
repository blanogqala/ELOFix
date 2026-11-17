process.env.DATABASE_URL ||= "postgresql://localhost/unit_test_unused";
const assert = require("assert");
const { resolveReleaseFundsDecision } = require("../src/utils/releaseFundsDecision.util");

const fiftyFifty = {
  legacyEscrowV2: false,
  paymentModeSnapshot: "TWO_PAYMENT_50_50",
  paymentProgress: "FIRST_PAID",
  quotedAmount: 500,
  firstPaymentAmount: 250,
  secondPaymentAmount: 250,
  totalPrice: 500,
};

assert.deepStrictEqual(
  resolveReleaseFundsDecision(fiftyFifty, { statusOverride: "DISPUTED" }, null),
  { amountDue: 250, owesCompletion: true, releaseHeldEscrow: false }
);

assert.deepStrictEqual(
  resolveReleaseFundsDecision(fiftyFifty, { statusOverride: "DISPUTED" }, { amount: 250 }),
  { amountDue: 250, owesCompletion: true, releaseHeldEscrow: false }
);

const courier = {
  legacyEscrowV2: false,
  paymentModeSnapshot: null,
  paymentProgress: "NONE",
  secondPaymentAmount: null,
  totalPrice: 200,
  price: 200,
  laborPaid: true,
};
assert.deepStrictEqual(
  resolveReleaseFundsDecision(courier, { courierFlow: true, statusOverride: "DISPUTED" }, null),
  { amountDue: 0, owesCompletion: false, releaseHeldEscrow: true },
  "a paid courier fee must not become a new half-price customer balance"
);

const legacy = {
  legacyEscrowV2: true,
  paymentProgress: "FIRST_PAID",
  secondPaymentAmount: null,
  totalPrice: 800,
  laborPaid: true,
};
assert.deepStrictEqual(
  resolveReleaseFundsDecision(legacy, { statusOverride: "DISPUTED" }, null),
  { amountDue: 0, owesCompletion: false, releaseHeldEscrow: true },
  "legacy escrow was already collected and must be released, not billed again"
);

const payOnCompletion = {
  legacyEscrowV2: false,
  paymentModeSnapshot: "SINGLE_PAYMENT_ON_COMPLETION",
  paymentProgress: "NONE",
  quotedAmount: 500,
  firstPaymentAmount: 500,
  secondPaymentAmount: null,
  totalPrice: 500,
};
assert.deepStrictEqual(
  resolveReleaseFundsDecision(payOnCompletion, { statusOverride: "DISPUTED" }, null),
  { amountDue: 500, owesCompletion: true, releaseHeldEscrow: false },
  "pay-on-completion must bill the full balance, not half of the quote"
);

const fullyPaid = {
  legacyEscrowV2: false,
  paymentModeSnapshot: "SINGLE_PAYMENT_UPFRONT",
  paymentProgress: "FULLY_PAID",
  quotedAmount: 500,
  firstPaymentAmount: 500,
  secondPaymentAmount: null,
  totalPrice: 500,
};
assert.deepStrictEqual(
  resolveReleaseFundsDecision(fullyPaid, { statusOverride: "DISPUTED" }, null),
  { amountDue: 0, owesCompletion: false, releaseHeldEscrow: false }
);

console.log("releaseFundsDecision.test.js: ok");
