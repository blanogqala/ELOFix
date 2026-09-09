const { isStrongEnoughAdminPassword } = require("./adminSeedConfig");

const DEFAULT_EMAILS = {
  customerA: "staging.customer.a@elofix.test",
  customerB: "staging.customer.b@elofix.test",
  providerA: "staging.provider.a@elofix.test",
  providerB: "staging.provider.b@elofix.test",
  supplier: "staging.supplier@elofix.test",
};

function envTrim(env, name) {
  const raw = env[name];
  return raw == null ? "" : String(raw).trim();
}

function emailOrDefault(env, name, fallback) {
  return envTrim(env, name).toLowerCase() || fallback;
}

/**
 * Resolve staging seed emails/passwords from env.
 * Passwords never have defaults. Production requires a strong STAGING_SEED_PASSWORD
 * (or per-account overrides). Do not log password values.
 */
function resolveStagingSeedConfig({ nodeEnv, env } = {}) {
  const e = env || process.env;
  const production = String(nodeEnv != null ? nodeEnv : e.NODE_ENV || "").toLowerCase() === "production";
  const shared = e.STAGING_SEED_PASSWORD != null ? String(e.STAGING_SEED_PASSWORD) : "";

  const accounts = {
    customerA: {
      key: "customerA",
      role: "CUSTOMER",
      name: "Staging Customer A",
      email: emailOrDefault(e, "STAGING_CUSTOMER_A_EMAIL", DEFAULT_EMAILS.customerA),
      password: envTrim(e, "STAGING_CUSTOMER_A_PASSWORD") || shared,
    },
    customerB: {
      key: "customerB",
      role: "CUSTOMER",
      name: "Staging Customer B",
      email: emailOrDefault(e, "STAGING_CUSTOMER_B_EMAIL", DEFAULT_EMAILS.customerB),
      password: envTrim(e, "STAGING_CUSTOMER_B_PASSWORD") || shared,
    },
    providerA: {
      key: "providerA",
      role: "PROVIDER",
      name: "Staging Provider A",
      email: emailOrDefault(e, "STAGING_PROVIDER_A_EMAIL", DEFAULT_EMAILS.providerA),
      password: envTrim(e, "STAGING_PROVIDER_A_PASSWORD") || shared,
      approved: true,
    },
    providerB: {
      key: "providerB",
      role: "PROVIDER",
      name: "Staging Provider B",
      email: emailOrDefault(e, "STAGING_PROVIDER_B_EMAIL", DEFAULT_EMAILS.providerB),
      password: envTrim(e, "STAGING_PROVIDER_B_PASSWORD") || shared,
      approved: false,
    },
    supplier: {
      key: "supplier",
      role: "SUPPLIER",
      name: "Staging Supplier",
      email: emailOrDefault(e, "STAGING_SUPPLIER_EMAIL", DEFAULT_EMAILS.supplier),
      password: envTrim(e, "STAGING_SUPPLIER_PASSWORD") || shared,
    },
  };

  const missing = Object.values(accounts)
    .filter((a) => !a.password)
    .map((a) => a.key);

  if (missing.length) {
    const err = new Error(
      `Staging seed requires STAGING_SEED_PASSWORD (or per-account STAGING_*_PASSWORD). Missing password for: ${missing.join(", ")}.`
    );
    err.code = "STAGING_SEED_PASSWORD_MISSING";
    throw err;
  }

  if (production) {
    const weak = Object.values(accounts)
      .filter((a) => !isStrongEnoughAdminPassword(a.password))
      .map((a) => a.key);
    if (weak.length) {
      const err = new Error(
        "STAGING_SEED_PASSWORD does not meet production quality rules (minimum 10 characters, upper, lower, and a digit)."
      );
      err.code = "STAGING_SEED_PASSWORD_WEAK";
      throw err;
    }
  }

  return {
    emails: DEFAULT_EMAILS,
    accounts,
  };
}

function publicStagingAccountList(config) {
  return Object.values(config.accounts).map((a) => ({
    key: a.key,
    role: a.role,
    email: a.email,
    name: a.name,
    approved: a.approved,
  }));
}

module.exports = {
  DEFAULT_EMAILS,
  resolveStagingSeedConfig,
  publicStagingAccountList,
};
