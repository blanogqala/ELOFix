/**
 * Pre-launch / staging deployments can set ELOFIX_TESTING_MODE=true to use
 * built-in test secrets when SECRET_KEY is not configured yet.
 * Remove or set false before real launch and set proper SECRET_KEY + BANK_KDF_SALT.
 */
const TESTING_FALLBACK_SECRET = "elofix-testing-secret-key";
const TESTING_FALLBACK_BANK_SALT = "elofix-testing-bank-salt";

function isTestingDeployment() {
  const raw = String(process.env.ELOFIX_TESTING_MODE || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function isValidSecretLength(value) {
  return Boolean(value && String(value).trim().length >= 8);
}

function resolveSecretKey({ purpose = "encryption" } = {}) {
  const configured = process.env.SECRET_KEY;
  if (isValidSecretLength(configured)) {
    return String(configured).trim();
  }
  if (isTestingDeployment()) {
    return TESTING_FALLBACK_SECRET;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `SECRET_KEY must be set for ${purpose}. For pre-launch testing only, set ELOFIX_TESTING_MODE=true on the server.`
    );
  }
  return "dev-identity-hash-key";
}

function resolveBankKdfSalt() {
  const configured = process.env.BANK_KDF_SALT;
  if (isValidSecretLength(configured)) {
    return String(configured).trim();
  }
  if (isTestingDeployment()) {
    return TESTING_FALLBACK_BANK_SALT;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BANK_KDF_SALT must be set for bank field encryption. For pre-launch testing only, set ELOFIX_TESTING_MODE=true on the server."
    );
  }
  const secret = resolveSecretKey({ purpose: "bank field encryption" });
  return `dev:${secret.slice(0, 48)}`;
}

module.exports = {
  isTestingDeployment,
  resolveSecretKey,
  resolveBankKdfSalt,
};
