const { PAYSTACK_API_BASE } = require("./paystack.payload");
const { assertPaystackCredentials } = require("./paymentConfig");

const SENSITIVE_KEY =
  /^(authorization|account_number|accountNumber|card|bin|last4|cvv|cvc|secret|secret_key|PAYSTACK_SECRET_KEY)$/i;

function maskAccountNumber(value) {
  const s = String(value == null ? "" : value).replace(/\s+/g, "");
  if (!s) return "";
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}

function redactDeep(input) {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((item) => redactDeep(item));
  if (typeof input !== "object") return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(String(key || ""))) {
      if (String(key).toLowerCase().includes("account")) {
        out[key] = maskAccountNumber(value);
      } else {
        out[key] = "[redacted]";
      }
      continue;
    }
    out[key] = typeof value === "object" ? redactDeep(value) : value;
  }
  return out;
}

function readSecret(env = process.env) {
  assertPaystackCredentials(env);
  return String(env.PAYSTACK_SECRET_KEY || "").trim();
}

/**
 * Documented Paystack REST helper. Never logs secret keys or Authorization headers.
 * @param {string} method
 * @param {string} apiPath
 * @param {object|null} [body]
 * @param {NodeJS.ProcessEnv} [env]
 */
async function paystackRequest(method, apiPath, body, env = process.env) {
  const secret = readSecret(env);
  const { keyPrefix } = assertPaystackCredentials(env);
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
    err.code = "PAYSTACK_HTTP";
    err.httpStatus = res.status;
    err.paystack = redactDeep({
      status: json?.status,
      message: json?.message,
      httpStatus: res.status,
      keyPrefix,
    });
    throw err;
  }

  return { httpStatus: res.status, json };
}

module.exports = {
  maskAccountNumber,
  redactDeep,
  readSecret,
  paystackRequest,
};
