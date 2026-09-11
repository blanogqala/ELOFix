#!/usr/bin/env node
/**
 * D1.5 — Verify a TEST transaction. Does not settle EloFix PaymentIntent.
 * Usage: node scripts/paystack-d15/verify-transaction.js <reference>
 */
const { assertPaystackTestMode, paystackRequest } = require("./client");
const { safePrint } = require("./redact");

function expectedGrossShares(amountCents) {
  const commissionCents = Math.round(amountCents * 0.07);
  return {
    gross_cents: amountCents,
    elofix_gross_cents: commissionCents,
    recipient_gross_cents: amountCents - commissionCents,
  };
}

async function main() {
  assertPaystackTestMode();
  const reference = String(process.argv[2] || "").trim();
  if (!reference) {
    throw new Error("reference argument required");
  }

  const json = await paystackRequest("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  const data = json.data || {};
  const amountCents = Number(data.amount);
  const shares = Number.isFinite(amountCents) ? expectedGrossShares(amountCents) : null;
  const feesSplit = data.fees_split || null;
  const subaccount = data.subaccount && typeof data.subaccount === "object" ? data.subaccount : {};

  safePrint("[paystack-d15] verify-transaction", {
    ok: true,
    domain: data.domain || null,
    status: data.status || null,
    reference: data.reference || null,
    amount_cents: Number.isFinite(amountCents) ? amountCents : null,
    currency: data.currency || null,
    id: data.id != null ? String(data.id) : null,
    fees: data.fees != null ? data.fees : null,
    fees_split: feesSplit,
    subaccount: {
      id: subaccount.id != null ? String(subaccount.id) : null,
      subaccount_code: subaccount.subaccount_code || null,
      percentage_charge: subaccount.percentage_charge ?? null,
    },
    split: data.split || null,
    expected_gross_shares: shares,
    paid_at: data.paid_at || data.paidAt || null,
  });
}

main().catch((err) => {
  if (err.code === "D15_REFUSED_LIVE_KEY") {
    console.error(err.message);
  } else {
    console.error("[paystack-d15] verify-transaction FAILED", err.message);
  }
  process.exit(1);
});
