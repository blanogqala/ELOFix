const AppError = require("../../utils/AppError");
const payfast = require("./payfast.gateway");
const payflex = require("./payflex.gateway");
const payjustnow = require("./payjustnow.gateway");
const paystack = require("./paystack.gateway");
const { isProviderEnabled, providerEnvKey } = require("./paymentConfig");

const GATEWAYS = {
  PAYFAST: payfast,
  PAYFLEX: payflex,
  PAYJUSTNOW: payjustnow,
  PAYSTACK: paystack,
};

function normalizeProvider(input) {
  const p = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "")
    .replace(/ /g, "");
  if (p === "PAYFAST") return "PAYFAST";
  if (p === "PAYFLEX") return "PAYFLEX";
  if (p === "PAYJUSTNOW" || p === "PJN") return "PAYJUSTNOW";
  if (p === "PAYSTACK") return "PAYSTACK";
  return null;
}

function getGateway(providerInput) {
  const key = normalizeProvider(providerInput);
  if (!key || !GATEWAYS[key]) {
    throw new AppError("Invalid payment provider", 400);
  }
  const mapKey = providerEnvKey(key);
  if (!isProviderEnabled(mapKey)) {
    throw new AppError("Payment provider is not enabled", 503);
  }
  const gw = GATEWAYS[key];
  if (!gw.isConfigured()) {
    throw new AppError(`${key} is not configured`, 503);
  }
  return gw;
}

function listEnabledGateways() {
  return Object.entries(GATEWAYS)
    .filter(([k]) => {
      const mapKey = providerEnvKey(k);
      return isProviderEnabled(mapKey) && GATEWAYS[k].isConfigured();
    })
    .map(([k]) => k);
}

module.exports = {
  getGateway,
  normalizeProvider,
  listEnabledGateways,
  GATEWAYS,
};
