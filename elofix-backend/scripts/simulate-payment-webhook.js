#!/usr/bin/env node
/**
 * Replay payment webhooks against a running local API.
 * Usage:
 *   node scripts/simulate-payment-webhook.js payfast --reference EF-ABC --amount 100.00 --status COMPLETE
 */
require("dotenv").config();
const crypto = require("crypto");

const args = process.argv.slice(2);
const provider = args[0] || "payfast";
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const base = (process.env.PAYMENT_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const reference = getArg("--reference") || `EF-TEST-${Date.now()}`;
const amount = getArg("--amount") || "100.00";
const status = getArg("--status") || "COMPLETE";

async function postPayfast() {
  const payfast = require("../src/services/payments/payfast.gateway");
  const fields = {
    m_payment_id: reference,
    pf_payment_id: `pf-${Date.now()}`,
    payment_status: status,
    amount_gross: amount,
    merchant_id: process.env.PAYFAST_MERCHANT_ID || "10000100",
  };
  fields.signature = payfast.buildItnSignature(fields, process.env.PAYFAST_PASSPHRASE || "");
  const body = new URLSearchParams(fields).toString();
  const res = await fetch(`${base}/api/payments/webhooks/payfast`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  console.log(res.status, text);
}

async function postJson(path, payload, secret) {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret || "test").update(raw).digest("hex");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-signature": sig,
    },
    body: raw,
  });
  const json = await res.json().catch(() => ({}));
  console.log(res.status, json);
}

async function main() {
  if (provider === "payfast") {
    await postPayfast();
    return;
  }
  if (provider === "payflex") {
    await postJson(
      "/api/payments/webhooks/payflex",
      {
        merchantReference: reference,
        orderId: `pfx-${Date.now()}`,
        status: "approved",
        amount: Number(amount),
        eventId: `evt-${Date.now()}`,
      },
      process.env.PAYFLEX_WEBHOOK_SECRET
    );
    return;
  }
  if (provider === "payjustnow") {
    await postJson(
      "/api/payments/webhooks/payjustnow",
      {
        merchant_reference: reference,
        transaction_id: `pjn-${Date.now()}`,
        status: "paid",
        amount: Math.round(Number(amount) * 100),
        event_id: `evt-${Date.now()}`,
      },
      process.env.PAYJUSTNOW_WEBHOOK_SECRET
    );
    return;
  }
  console.error("Unknown provider:", provider);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
