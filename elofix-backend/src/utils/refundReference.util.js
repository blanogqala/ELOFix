const { randomBytes } = require("crypto");

/**
 * Unique bank-transfer reference for provider refund debt repayment.
 * Format: EFX-<shortId> / <FULL NAME>
 */
function generateRefundReference(provider) {
  const shortId = randomBytes(4).toString("hex").toUpperCase();
  const user = provider?.user || provider;
  const fullName = String(user?.name || provider?.businessName || "Provider").trim().toUpperCase();
  return `EFX-${shortId} / ${fullName}`;
}

module.exports = {
  generateRefundReference,
};
