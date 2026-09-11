const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { PAYSTACK_API_BASE } = require("./payload");
const { redactDeep } = require("./redact");

const LIVE_KEY_MESSAGE = "D1.5 REFUSED LIVE KEY";

function secretKeyPrefix(secret) {
  const s = String(secret || "").trim();
  if (s.startsWith("sk_live_")) return "sk_live_";
  if (s.startsWith("sk_test_")) return "sk_test_";
  return "";
}

/**
 * Fail-closed TEST mode. Never infers live/test from NODE_ENV.
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertPaystackTestMode(env = process.env) {
  const mode = String(env.PAYSTACK_MODE || "").trim().toLowerCase();
  const secret = String(env.PAYSTACK_SECRET_KEY || "").trim();
  const prefix = secretKeyPrefix(secret);

  if (prefix === "sk_live_") {
    const err = new Error(LIVE_KEY_MESSAGE);
    err.code = "D15_REFUSED_LIVE_KEY";
    throw err;
  }
  if (mode !== "test") {
    const err = new Error("D1.5 requires PAYSTACK_MODE=test");
    err.code = "D15_MODE_NOT_TEST";
    throw err;
  }
  if (prefix !== "sk_test_") {
    const err = new Error("D1.5 requires PAYSTACK_SECRET_KEY beginning with sk_test_");
    err.code = "D15_TEST_KEY_REQUIRED";
    throw err;
  }
  return { mode: "test", keyPrefix: "sk_test_" };
}

function readDedicatedTestBankEnv(env = process.env) {
  return {
    email: String(env.PAYSTACK_D15_TEST_EMAIL || "").trim(),
    businessName: String(env.PAYSTACK_D15_TEST_BUSINESS_NAME || "").trim(),
    bankName: String(env.PAYSTACK_D15_TEST_BANK_NAME || "").trim(),
    accountNumber: String(env.PAYSTACK_D15_TEST_ACCOUNT_NUMBER || "").trim(),
    bankCode: String(env.PAYSTACK_D15_TEST_BANK_CODE || "").trim(),
    subaccountCode: String(env.PAYSTACK_D15_TEST_SUBACCOUNT_CODE || "").trim(),
  };
}

function assertDedicatedTestBankEnv(env = process.env) {
  const fields = readDedicatedTestBankEnv(env);
  const missing = [];
  if (!fields.email) missing.push("PAYSTACK_D15_TEST_EMAIL");
  if (!fields.businessName) missing.push("PAYSTACK_D15_TEST_BUSINESS_NAME");
  if (!fields.bankName) missing.push("PAYSTACK_D15_TEST_BANK_NAME");
  if (!fields.accountNumber) missing.push("PAYSTACK_D15_TEST_ACCOUNT_NUMBER");
  if (missing.length) {
    const err = new Error(
      `D1.5 dedicated TEST bank/email env missing: ${missing.join(", ")}. Do not use real provider/supplier profiles.`
    );
    err.code = "D15_TEST_BANK_MISSING";
    err.missing = missing;
    throw err;
  }
  return fields;
}

async function paystackRequest(method, apiPath, body) {
  const { keyPrefix } = assertPaystackTestMode();
  const secret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  const url = `${PAYSTACK_API_BASE}${apiPath}`;
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { status: false, message: `Non-JSON response HTTP ${res.status}` };
  }

  if (!res.ok || json?.status === false) {
    const err = new Error(json?.message || `Paystack HTTP ${res.status}`);
    err.code = "D15_PAYSTACK_HTTP";
    err.httpStatus = res.status;
    err.paystack = redactDeep({
      status: json?.status,
      message: json?.message,
      httpStatus: res.status,
      keyPrefix,
    });
    throw err;
  }

  return json;
}

module.exports = {
  LIVE_KEY_MESSAGE,
  secretKeyPrefix,
  assertPaystackTestMode,
  readDedicatedTestBankEnv,
  assertDedicatedTestBankEnv,
  paystackRequest,
};
