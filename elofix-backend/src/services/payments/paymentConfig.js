function paymentCurrency() {
  return String(process.env.PAYMENT_CURRENCY || "ZAR").trim().toUpperCase();
}

function frontendBaseUrl() {
  return String(process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
}

function paymentBaseUrl() {
  return String(process.env.PAYMENT_BASE_URL || process.env.API_PUBLIC_URL || "http://localhost:5000").replace(
    /\/$/,
    ""
  );
}

function enabledProviders() {
  const raw = String(process.env.ENABLED_PAYMENT_PROVIDERS || "payfast,payflex,payjustnow").toLowerCase();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isProviderEnabled(providerKey) {
  return enabledProviders().has(String(providerKey).toLowerCase());
}

function isProductionEnv(nodeEnv = process.env.NODE_ENV) {
  return String(nodeEnv || "").toLowerCase() === "production";
}

function envFlagTrue(name, env = process.env) {
  return String(env[name] || "").toLowerCase() === "true";
}

function allowAdminPaymentOverride() {
  if (String(process.env.ALLOW_ADMIN_PAYMENT_OVERRIDE || "").toLowerCase() === "true") {
    return true;
  }
  return !isProductionEnv();
}

/**
 * Production must never skip PayFast ITN IP checks.
 * Local/dev may set PAYFAST_SKIP_IP_CHECK=true.
 */
function payfastSkipIpCheckAllowed(env = process.env) {
  if (isProductionEnv(env.NODE_ENV)) return false;
  return envFlagTrue("PAYFAST_SKIP_IP_CHECK", env);
}

/**
 * Production never settles from the browser return URL.
 * Local/dev: on whenever PAYFAST_MODE is not live, unless PAYFAST_SETTLE_ON_RETURN=false.
 */
function payfastSettleOnReturn(env = process.env) {
  if (isProductionEnv(env.NODE_ENV)) return false;
  if (String(env.PAYFAST_SETTLE_ON_RETURN || "").toLowerCase() === "false") {
    return false;
  }
  if (String(env.PAYFAST_SETTLE_ON_RETURN || "").toLowerCase() === "true") {
    return true;
  }
  return String(env.PAYFAST_MODE || "sandbox").toLowerCase() !== "live";
}

/**
 * Fail closed when a hosted/production process is given sandbox settlement shortcuts.
 * Does not print secret values.
 */
function assertProductionPaymentSafety(env = process.env) {
  if (!isProductionEnv(env.NODE_ENV)) return { ok: true };

  const skipIp = envFlagTrue("PAYFAST_SKIP_IP_CHECK", env);
  const settleOnReturn = envFlagTrue("PAYFAST_SETTLE_ON_RETURN", env);
  if (!skipIp && !settleOnReturn) {
    return { ok: true };
  }

  const flags = [];
  if (skipIp) flags.push("PAYFAST_SKIP_IP_CHECK=true");
  if (settleOnReturn) flags.push("PAYFAST_SETTLE_ON_RETURN=true");
  const err = new Error(
    `Unsafe PayFast configuration in production: ${flags.join(", ")}. Unset these flags; hosted environments must use ITN webhooks and IP verification.`
  );
  err.code = "UNSAFE_PAYFAST_PRODUCTION_CONFIG";
  throw err;
}

/** When true, attempt marketplace branch settlement via a capable gateway adapter. */
function marketplaceSettlementEnabled() {
  return String(process.env.MARKETPLACE_SETTLEMENT_ENABLED || "false").toLowerCase() === "true";
}

/**
 * First enabled gateway that supports marketplace branch settlement.
 * @returns {import('./payfast.gateway') | null}
 */
function settlementCapableGateway() {
  if (!marketplaceSettlementEnabled()) return null;
  const { GATEWAYS } = require("./gatewayRegistry");
  const { enabledProviders } = module.exports;
  for (const [key, gw] of Object.entries(GATEWAYS)) {
    const mapKey = { PAYFAST: "payfast", PAYFLEX: "payflex", PAYJUSTNOW: "payjustnow" }[key];
    if (!enabledProviders().has(mapKey)) continue;
    if (typeof gw.supportsMarketplaceSettlement === "function" && gw.supportsMarketplaceSettlement()) {
      if (typeof gw.isConfigured === "function" && gw.isConfigured()) return gw;
    }
  }
  return null;
}

module.exports = {
  paymentCurrency,
  frontendBaseUrl,
  paymentBaseUrl,
  enabledProviders,
  isProviderEnabled,
  allowAdminPaymentOverride,
  isProductionEnv,
  payfastSkipIpCheckAllowed,
  payfastSettleOnReturn,
  assertProductionPaymentSafety,
  marketplaceSettlementEnabled,
  settlementCapableGateway,
};
