function detectBrand(number) {
  const n = String(number || "");
  if (n.startsWith("34") || n.startsWith("37")) return "amex";
  if (n.startsWith("5")) return "mastercard";
  return "visa";
}

function parseMaskedLast4(masked) {
  const digits = String(masked || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4.length === 4 ? last4 : "";
}

function isValidCardLast4(last4) {
  const s = String(last4 || "").trim();
  return /^\d{4}$/.test(s) && !/^[*]+$/.test(s);
}

function brandFromGatewayLabel(raw) {
  const b = String(raw || "").toLowerCase();
  if (b.includes("master")) return "mastercard";
  if (b.includes("amex") || b.includes("american")) return "amex";
  if (b.includes("visa")) return "visa";
  return detectBrand(b);
}

/**
 * Extract display-safe card metadata from a gateway webhook / return payload.
 * Returns null when no usable last4 is present (e.g. BNPL providers without card data).
 */
function parsePaymentCardFromGatewayPayload(payload, provider) {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const providerKey = String(provider || "").toUpperCase();

  if (p.source === "sandbox_return_url" || p.source === "admin_force_settle") {
    const last4 = String(p.card_last4 || p.last4 || "4242").replace(/\D/g, "").slice(-4);
    if (!isValidCardLast4(last4)) return null;
    return {
      last4,
      brand: brandFromGatewayLabel(p.card_brand || p.brand || "visa"),
      expiryMonth: Number(p.expiry_month || p.expiryMonth || 12) || 12,
      expiryYear: Number(p.expiry_year || p.expiryYear || new Date().getFullYear() + 2),
    };
  }

  if (providerKey === "PAYFLEX" || providerKey === "PAYJUSTNOW") {
    return null;
  }

  let last4 = String(p.card_last4 || p.last4 || p.cc_last4 || "")
    .replace(/\D/g, "")
    .slice(-4);
  if (!isValidCardLast4(last4)) {
    const fromMask = parseMaskedLast4(p.masked_card || p.maskedCard || p.card_mask || p.maskedPaymentMethod);
    last4 = fromMask;
  }
  if (!isValidCardLast4(last4)) return null;

  return {
    last4,
    brand: brandFromGatewayLabel(p.card_brand || p.brand || p.card_type || p.payment_method),
    expiryMonth: Number(p.expiry_month || p.exp_month || 12) || 12,
    expiryYear: Number(p.expiry_year || p.exp_year || new Date().getFullYear() + 2),
  };
}

module.exports = {
  detectBrand,
  parseMaskedLast4,
  isValidCardLast4,
  parsePaymentCardFromGatewayPayload,
};
