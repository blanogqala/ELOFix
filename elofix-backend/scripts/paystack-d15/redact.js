const SENSITIVE_KEY =
  /^(authorization|authorization_code|account_number|accountNumber|card|bin|last4|cvv|cvc|secret|secret_key|authorization_url_token)$/i;

function maskAccountNumber(value) {
  const s = String(value == null ? "" : value).replace(/\s+/g, "");
  if (!s) return "";
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}

function redactValue(key, value) {
  if (value == null) return value;
  if (SENSITIVE_KEY.test(String(key || ""))) {
    if (String(key).toLowerCase().includes("account")) return maskAccountNumber(value);
    return "[redacted]";
  }
  if (typeof value === "object") return redactDeep(value);
  return value;
}

function redactDeep(input) {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((item) => redactDeep(item));
  if (typeof input !== "object") return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (String(key).toLowerCase() === "authorization" && value && typeof value === "object") {
      out[key] = "[redacted-card-authorization]";
      continue;
    }
    if (String(key).toLowerCase() === "account_number" || String(key).toLowerCase() === "accountnumber") {
      out[key] = maskAccountNumber(value);
      continue;
    }
    out[key] = redactValue(key, value);
  }
  return out;
}

function safePrint(label, data) {
  const payload = typeof data === "object" ? redactDeep(data) : data;
  console.log(label);
  console.log(JSON.stringify(payload, null, 2));
}

module.exports = {
  maskAccountNumber,
  redactDeep,
  safePrint,
};
