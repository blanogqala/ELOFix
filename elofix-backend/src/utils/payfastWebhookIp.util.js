const { clientKey } = require("../middleware/ipRateLimit.middleware");
const { normalizeIpv4 } = require("./ipv4Cidr.util");

function isRenderEnv(env = process.env) {
  return String(env.RENDER || "").toLowerCase() === "true";
}

function headerValue(req, name) {
  const headers = req?.headers || {};
  const direct = headers[name] || headers[String(name).toLowerCase()];
  if (Array.isArray(direct)) return String(direct[0] || "").trim();
  return String(direct || "").trim();
}

/**
 * PayFast ITN source IP on Render sits behind Cloudflare.
 * Do not use this helper for auth rate limiting.
 */
function resolvePayfastWebhookClientIp(req, env = process.env) {
  if (isRenderEnv(env)) {
    const cf = normalizeIpv4(headerValue(req, "cf-connecting-ip"));
    if (cf) return cf;

    const xff = headerValue(req, "x-forwarded-for");
    if (xff) {
      const original = normalizeIpv4(xff.split(",")[0]);
      if (original) return original;
    }
  }

  return clientKey(req);
}

module.exports = {
  isRenderEnv,
  resolvePayfastWebhookClientIp,
};
