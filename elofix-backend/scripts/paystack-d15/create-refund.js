#!/usr/bin/env node
/**
 * D1.5 — Create a Paystack TEST refund. Does not update EloFix refund state.
 * Usage: node scripts/paystack-d15/create-refund.js <transactionReference> [amountMajor]
 * Omit amountMajor for a full refund.
 */
const { assertPaystackTestMode, paystackRequest } = require("./client");
const { buildCreateRefundPayload } = require("./payload");
const { safePrint } = require("./redact");

async function main() {
  assertPaystackTestMode();
  const transaction = String(process.argv[2] || "").trim();
  if (!transaction) {
    throw new Error("transaction reference argument required");
  }
  const amountArg = process.argv[3];
  const amountMajor = amountArg == null || amountArg === "" ? null : Number(amountArg);

  const payload = buildCreateRefundPayload({
    transaction,
    amountMajor,
    currency: "ZAR",
  });

  const json = await paystackRequest("POST", "/refund", payload);
  const data = json.data || {};
  safePrint("[paystack-d15] create-refund", {
    ok: true,
    id: data.id != null ? String(data.id) : null,
    status: data.status || null,
    amount: data.amount != null ? data.amount : null,
    currency: data.currency || null,
    transaction: data.transaction != null ? String(data.transaction) : transaction,
    deducted_amount: data.deducted_amount != null ? data.deducted_amount : null,
    fully_deducted: data.fully_deducted ?? null,
    refunded_at: data.refunded_at || null,
    expected_at: data.expected_at || null,
    requested_amount_cents: payload.amount ?? "full",
  });
}

main().catch((err) => {
  if (err.code === "D15_REFUSED_LIVE_KEY") {
    console.error(err.message);
  } else {
    console.error("[paystack-d15] create-refund FAILED", err.message);
  }
  process.exit(1);
});
