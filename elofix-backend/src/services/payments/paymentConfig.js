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

module.exports = {
  paymentCurrency,
  frontendBaseUrl,
  paymentBaseUrl,
  enabledProviders,
  isProviderEnabled,
  allowAdminPaymentOverride,
  payfastSettleOnReturn,
};
