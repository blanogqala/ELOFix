const crypto = require("crypto");
const { resolveSecretKey } = require("./secretKey.util");

function getSecret() {
  return resolveSecretKey({ purpose: "identity hashing" });
}

function hmacHash(value, namespace = "default") {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return crypto.createHmac("sha256", getSecret()).update(`${namespace}:${text}`).digest("hex");
}

function hashPhone(normalizedPhone) {
  return hmacHash(normalizedPhone, "phone");
}

function hashSaId(idNumber) {
  const digits = String(idNumber ?? "").replace(/\D/g, "");
  return hmacHash(digits, "sa_id");
}

function hashCompanyRegistration(regNumber) {
  const normalized = String(regNumber ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]/g, "");
  return hmacHash(normalized, "company_reg");
}

function hashBankAccount(bankName, branchCode, accountNumber) {
  const composite = [
    String(bankName ?? "").trim().toLowerCase(),
    String(branchCode ?? "").trim(),
    String(accountNumber ?? "").trim(),
  ].join("|");
  return hmacHash(composite, "bank_account");
}

function sha256File(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = {
  hmacHash,
  hashPhone,
  hashSaId,
  hashCompanyRegistration,
  hashBankAccount,
  sha256File,
};
