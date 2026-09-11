#!/usr/bin/env node
/**
 * D1.5 — Initialize a TEST split payment (bearer=subaccount). Does not mark EloFix paid.
 * Usage: node scripts/paystack-d15/initialize-split-test.js [amountMajor] [label]
 * Default amount: 100 (R100.00)
 */
const {
  assertPaystackTestMode,
  assertDedicatedTestBankEnv,
  paystackRequest,
} = require("./client");
const {
  buildInitializeSplitPayload,
  assertInitializeSplitPayload,
} = require("./payload");
const { safePrint } = require("./redact");

async function main() {
  assertPaystackTestMode();
  const fields = assertDedicatedTestBankEnv();
  const amountMajor = Number(process.argv[2] || 100);
  const label = String(process.argv[3] || "d15-split").trim();
  const subaccount = fields.subaccountCode;
  if (!subaccount) {
    throw new Error("PAYSTACK_D15_TEST_SUBACCOUNT_CODE is required (from create-subaccount.js output).");
  }

  const payload = buildInitializeSplitPayload({
    email: fields.email,
    amountMajor,
    currency: "ZAR",
    subaccountCode: subaccount,
    metadata: {
      d15: true,
      label,
      paymentIntentId: null,
    },
  });
  assertInitializeSplitPayload(payload);

  const json = await paystackRequest("POST", "/transaction/initialize", payload);
  const data = json.data || {};
  safePrint("[paystack-d15] initialize-split-test", {
    ok: true,
    reference: payload.reference,
    amount_cents: payload.amount,
    currency: payload.currency,
    bearer: payload.bearer,
    subaccount: payload.subaccount,
    label,
    authorization_url: data.authorization_url || null,
    access_code: data.access_code ? "[present]" : null,
    note: "Complete Paystack TEST checkout in the browser. Do not simulate success.",
  });
}

main().catch((err) => {
  if (err.code === "D15_REFUSED_LIVE_KEY") {
    console.error(err.message);
  } else {
    console.error("[paystack-d15] initialize-split-test FAILED", err.message);
  }
  process.exit(1);
});
