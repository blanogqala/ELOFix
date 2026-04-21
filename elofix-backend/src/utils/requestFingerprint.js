const crypto = require("crypto");

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/**
 * SHA-256 hex of canonical body + method + path (no query string).
 * @param {string} method
 * @param {string} pathNoQuery e.g. /api/jobs/uuid/pay-labor
 * @param {object|undefined} body
 */
function financialRequestFingerprint(method, pathNoQuery, body) {
  const m = String(method || "GET").toUpperCase();
  const p = String(pathNoQuery || "").split("?")[0];
  const payload = body === undefined || body === null ? stableStringify({}) : stableStringify(body);
  return crypto.createHash("sha256").update(payload).update("\n").update(m).update("\n").update(p).digest("hex");
}

module.exports = { stableStringify, financialRequestFingerprint };
