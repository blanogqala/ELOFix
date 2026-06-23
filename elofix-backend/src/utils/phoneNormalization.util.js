/**
 * Normalize South African phone numbers to E.164 (+27...).
 * Returns null for empty/invalid input.
 */
function normalizePhone(phone) {
  if (phone == null) return null;
  let s = String(phone).trim().replace(/[\s\-().]/g, "");
  if (!s) return null;

  if (s.startsWith("+")) {
    s = s.slice(1);
  } else if (s.startsWith("00")) {
    s = s.slice(2);
  } else if (s.startsWith("0")) {
    s = "27" + s.slice(1);
  } else if (/^[6-8]\d{8}$/.test(s)) {
    s = "27" + s;
  }

  if (!/^27[6-8]\d{8}$/.test(s)) {
    return null;
  }
  return "+" + s;
}

module.exports = { normalizePhone };
