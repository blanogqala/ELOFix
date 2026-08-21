/**
 * Payment-specific redaction for logs / fingerprints.
 * Prefer these keys over generic `number` to avoid destroying unrelated useful logs.
 */

const SENSITIVE_PAYMENT_KEYS = new Set([
  "cardnumber",
  "card_number",
  "pan",
  "cvv",
  "cvc",
  "securitycode",
  "security_code",
  "pin",
  "otp",
]);

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function redactSensitivePaymentFields(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitivePaymentFields(v));
  }
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const keyNorm = String(k).toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (SENSITIVE_PAYMENT_KEYS.has(keyNorm) || keyNorm === "cardnumber" || keyNorm === "securitycode") {
      out[k] = "[REDACTED]";
      continue;
    }
    // Nested objects (e.g. card: { number, cvv })
    if (keyNorm === "card" && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSensitivePaymentFields(v);
      continue;
    }
    out[k] = redactSensitivePaymentFields(v);
  }
  return out;
}

/**
 * True when a request body still contains raw credential keys EloFix must not accept.
 * @param {unknown} body
 * @returns {string|null} first offending key name, or null
 */
function findRejectedCardCredentialKey(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const rejected = ["cvv", "cvc", "cardNumber", "card_number", "number", "pan", "securityCode", "security_code"];
  for (const key of rejected) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null && body[key] !== "") {
      // `number` alone is ambiguous (phone, qty); only reject when paired with card-ish context
      if (key === "number") {
        const hasCardContext =
          Object.prototype.hasOwnProperty.call(body, "expiryMonth") ||
          Object.prototype.hasOwnProperty.call(body, "expiryYear") ||
          Object.prototype.hasOwnProperty.call(body, "cvv") ||
          Object.prototype.hasOwnProperty.call(body, "cvc") ||
          Object.prototype.hasOwnProperty.call(body, "brand");
        if (!hasCardContext) continue;
      }
      return key;
    }
  }
  if (body.card && typeof body.card === "object") {
    const nested = findRejectedCardCredentialKey(body.card);
    if (nested) return `card.${nested}`;
  }
  return null;
}

module.exports = {
  redactSensitivePaymentFields,
  findRejectedCardCredentialKey,
  SENSITIVE_PAYMENT_KEYS,
};
