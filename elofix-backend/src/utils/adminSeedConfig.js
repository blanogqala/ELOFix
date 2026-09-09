const DEFAULT_DEV_ADMIN = {
  email: "admin@elofix.com",
  password: "Admin@123",
  name: "ELOFix Admin",
};

function isProductionEnv(nodeEnv) {
  return String(nodeEnv || "").toLowerCase() === "production";
}

function isStrongEnoughAdminPassword(password) {
  const p = String(password || "");
  if (p.length < 10) return false;
  if (!/[A-Z]/.test(p)) return false;
  if (!/[a-z]/.test(p)) return false;
  if (!/[0-9]/.test(p)) return false;
  return true;
}

/**
 * Resolve admin seed credentials.
 * Production fails closed when ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME are missing
 * or the password is too weak. Never log the password.
 */
function resolveAdminSeedConfig({ nodeEnv, env } = {}) {
  const e = env || process.env;
  const production = isProductionEnv(nodeEnv != null ? nodeEnv : e.NODE_ENV);
  const email = String(e.ADMIN_EMAIL || "")
    .toLowerCase()
    .trim();
  const password = e.ADMIN_PASSWORD != null ? String(e.ADMIN_PASSWORD) : "";
  const name = String(e.ADMIN_NAME || "").trim();

  if (production) {
    const missing = [];
    if (!email) missing.push("ADMIN_EMAIL");
    if (!password) missing.push("ADMIN_PASSWORD");
    if (!name) missing.push("ADMIN_NAME");
    if (missing.length) {
      const err = new Error(
        `Production seed requires ${missing.join(", ")}. Refusing to create an administrator with fallback credentials.`
      );
      err.code = "ADMIN_SEED_CONFIG_MISSING";
      throw err;
    }
    if (!isStrongEnoughAdminPassword(password)) {
      const err = new Error(
        "ADMIN_PASSWORD does not meet production quality rules (minimum 10 characters, upper, lower, and a digit)."
      );
      err.code = "ADMIN_SEED_PASSWORD_WEAK";
      throw err;
    }
    return { email, password, name };
  }

  return {
    email: email || DEFAULT_DEV_ADMIN.email,
    password: password || DEFAULT_DEV_ADMIN.password,
    name: name || DEFAULT_DEV_ADMIN.name,
  };
}

module.exports = {
  DEFAULT_DEV_ADMIN,
  isStrongEnoughAdminPassword,
  resolveAdminSeedConfig,
};
