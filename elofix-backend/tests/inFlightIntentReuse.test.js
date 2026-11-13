const assert = require("assert");
const { decideInFlightIntentReuse } = require("../src/services/payments/inFlightIntentReuse.util");

const cases = [
  [{ state: "FAILED", provider: "PAYSTACK" }, "rotate"],
  [{ state: "CANCELLED", provider: "PAYFAST" }, "rotate"],
  [{ state: "REFUNDED", provider: "PAYSTACK", verifyState: "PAID" }, "rotate"],
  [{ state: "PENDING", provider: "PAYFAST" }, "preserve"],
  [{ state: "PROCESSING", provider: "PAYFAST" }, "preserve"],
  [{ state: "PENDING", provider: "PAYFLEX" }, "preserve"],
  [{ state: "PENDING", provider: "PAYSTACK", verifyState: "PAID" }, "settle"],
  [{ state: "PROCESSING", provider: "PAYSTACK", verifyState: "PAID" }, "settle"],
  [{ state: "PENDING", provider: "PAYSTACK", verifyState: "PROCESSING" }, "preserve"],
  [{ state: "PROCESSING", provider: "PAYSTACK", verifyState: "PROCESSING" }, "preserve"],
  [{ state: "PENDING", provider: "PAYSTACK", verifyState: "FAILED" }, "rotate"],
  [{ state: "PENDING", provider: "PAYSTACK", verifyState: "CANCELLED" }, "rotate"],
  [{ state: "PROCESSING", provider: "PAYSTACK", verifyState: "CANCELLED" }, "rotate"],
  [{ state: "PENDING", provider: "PAYSTACK", verifyHttpStatus: 404 }, "preserve"],
  [{ state: "PENDING", provider: "PAYSTACK" }, "abort"],
  [{ state: "PROCESSING", provider: "PAYSTACK", verifyState: "" }, "abort"],
];

for (const [input, expected] of cases) {
  const actual = decideInFlightIntentReuse(input);
  assert.strictEqual(
    actual,
    expected,
    `${JSON.stringify(input)} → ${actual}, expected ${expected}`
  );
}

console.log("inFlightIntentReuse.test.js passed");
