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

function allowAdminPaymentOverride() {
  if (String(process.env.ALLOW_ADMIN_PAYMENT_OVERRIDE || "").toLowerCase() === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

/**
 * Sandbox: PayFast ITN often cannot reach the API (localhost, Render cold start, proxy IP).
 * Settle when the customer hits return_url after checkout. Live mode always uses ITN webhooks.
 * Opt out with PAYFAST_SETTLE_ON_RETURN=false.
 */
function payfastSettleOnReturn() {
  if (String(process.env.PAYFAST_SETTLE_ON_RETURN || "").toLowerCase() === "false") {
    return false;
  }
  return String(process.env.PAYFAST_MODE || "sandbox").toLowerCase() !== "live";
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
  payfastSettleOnReturn,
  marketplaceSettlementEnabled,
  settlementCapableGateway,
};
