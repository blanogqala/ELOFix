/**
 * Validate South African ID number (13 digits with Luhn checksum on first 12).
 */
function validateSaId(idNumber) {
  const digits = String(idNumber ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return false;
  if (!/^\d{13}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = parseInt(digits[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[12], 10);
}

module.exports = { validateSaId };
