#!/usr/bin/env node
/**
 * D1.5 — Create ONE Paystack TEST subaccount. Does not write to Prisma.
 * Usage: node scripts/paystack-d15/create-subaccount.js [bank_code]
 */
const { assertPaystackTestMode, assertDedicatedTestBankEnv, paystackRequest } = require("./client");
const { fetchSouthAfricanBanks } = require("./banks");
const { buildCreateSubaccountPayload, ELOFIX_GROSS_COMMISSION_PERCENT } = require("./payload");
const { maskAccountNumber, safePrint } = require("./redact");

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveBankCode(banks, bankName, explicitCode) {
  if (explicitCode) return String(explicitCode).trim();
  const wanted = normalizeName(bankName);
  const list = Array.isArray(banks) ? banks : [];
  const exact = list.find((b) => normalizeName(b.name) === wanted);
  if (exact?.code) return String(exact.code);
  const contains = list.filter(
    (b) => normalizeName(b.name).includes(wanted) || wanted.includes(normalizeName(b.name))
  );
  if (contains.length === 1 && contains[0].code) return String(contains[0].code);
  return null;
}

async function main() {
  assertPaystackTestMode();
  const fields = assertDedicatedTestBankEnv();
  const explicitCode = String(process.argv[2] || fields.bankCode || "").trim();

  const listed = await fetchSouthAfricanBanks(paystackRequest);
  const banks = listed.banks;
  const bankCode = resolveBankCode(banks, fields.bankName, explicitCode);
  if (!bankCode) {
    throw new Error(
      `Could not resolve Paystack bank_code from PAYSTACK_D15_TEST_BANK_NAME. Pass code as argv or set PAYSTACK_D15_TEST_BANK_CODE.`
    );
  }

  const payload = buildCreateSubaccountPayload({
    businessName: fields.businessName,
    bankCode,
    accountNumber: fields.accountNumber,
    percentageCharge: ELOFIX_GROSS_COMMISSION_PERCENT,
  });

  const json = await paystackRequest("POST", "/subaccount", payload);
  const data = json.data || {};
  safePrint("[paystack-d15] create-subaccount", {
    ok: true,
    domain: data.domain || null,
    currency: data.currency || null,
    subaccount_code: data.subaccount_code || null,
    percentage_charge: data.percentage_charge ?? payload.percentage_charge,
    active: data.active ?? null,
    is_verified: data.is_verified ?? null,
    settlement_schedule: data.settlement_schedule || null,
    settlement_bank: data.settlement_bank || null,
    account_number_masked: maskAccountNumber(fields.accountNumber),
  });
}

main().catch((err) => {
  if (err.code === "D15_REFUSED_LIVE_KEY") {
    console.error(err.message);
  } else {
    console.error("[paystack-d15] create-subaccount FAILED", err.message);
  }
  process.exit(1);
});
