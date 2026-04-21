const MAX_LEN = 128;

/**
 * @param {import("express").Request} req
 * @returns {string | null}
 */
function parseIdempotencyKey(req) {
  const raw = req.get("Idempotency-Key") || req.get("idempotency-key");
  if (raw == null || typeof raw !== "string") return null;
  const key = raw.trim();
  if (!key || key.length > MAX_LEN) return null;
  return key;
}

module.exports = { parseIdempotencyKey, MAX_LEN };
