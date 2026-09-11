#!/usr/bin/env node
/**
 * D1.5 — List Paystack South African banks (TEST mode).
 * Usage: node scripts/paystack-d15/list-banks.js
 *
 * Primary: GET /bank?currency=ZAR&enabled_for_verification=true
 * Fallback: GET /bank?country=south%20africa
 */
const { assertPaystackTestMode, paystackRequest } = require("./client");
const { classifyBankNameMapping, fetchSouthAfricanBanks } = require("./banks");
const { safePrint } = require("./redact");

async function main() {
  assertPaystackTestMode();
  const result = await fetchSouthAfricanBanks(paystackRequest);
  const mapping = classifyBankNameMapping(result.banks);
  safePrint("[paystack-d15] list-banks", {
    ok: true,
    query: result.query,
    fallbackUsed: result.fallbackUsed,
    count: result.banks.length,
    mapping,
    banks: result.banks,
  });
}

main().catch((err) => {
  if (err.code === "D15_REFUSED_LIVE_KEY") {
    console.error(err.message);
  } else {
    console.error("[paystack-d15] list-banks FAILED", err.message);
  }
  process.exit(1);
});
