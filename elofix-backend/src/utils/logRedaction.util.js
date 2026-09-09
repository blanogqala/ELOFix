const SENSITIVE_QUERY_KEYS = new Set([
  "code",
  "token",
  "access_token",
  "id_token",
  "access",
  "password",
  "resetToken",
  "reset_token",
]);

function redactRequestUrl(url) {
  const raw = String(url || "");
  const q = raw.indexOf("?");
  if (q === -1) return raw;
  const pathname = raw.slice(0, q);
  const search = raw.slice(q + 1);
  const params = new URLSearchParams(search);
  let changed = false;
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase())) {
      params.set(key, "REDACTED");
      changed = true;
    }
  }
  if (!changed) return raw;
  const next = params.toString();
  return next ? `${pathname}?${next}` : pathname;
}

module.exports = {
  SENSITIVE_QUERY_KEYS,
  redactRequestUrl,
};
