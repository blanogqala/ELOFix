/**
 * Shared checkout legal acceptance payload for payment-intent integration tests.
 * Must match LEGAL_VERSIONS in src/config/legalVersions.js.
 */
const { LEGAL_VERSIONS } = require("../../src/config/legalVersions");

function checkoutRequiresDeliveryPolicy(kind) {
  const k = String(kind || "").toUpperCase();
  return k === "MATERIAL_ORDER" || k === "JOB_STORE_ORDER" || k === "DELIVERY_FEE";
}

function checkoutLegalAcceptance(kind = "LABOR") {
  const requiresDelivery = checkoutRequiresDeliveryPolicy(kind);
  return {
    refundPolicyAccepted: true,
    refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
    deliveryPolicyAcknowledged: requiresDelivery,
    deliveryPolicyVersion: requiresDelivery ? LEGAL_VERSIONS.deliveryPolicy : null,
  };
}

module.exports = {
  checkoutLegalAcceptance,
  checkoutRequiresDeliveryPolicy,
  LEGAL_VERSIONS,
};
