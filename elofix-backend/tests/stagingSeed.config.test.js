/**
 * Staging seed config: passwords required, never defaulted, not leaked in errors.
 * Run: node tests/stagingSeed.config.test.js
 */
const assert = require("assert");
const { resolveStagingSeedConfig, DEFAULT_EMAILS } = require("../src/utils/stagingSeedConfig");

function run() {
  const missing = (() => {
    try {
      resolveStagingSeedConfig({ nodeEnv: "development", env: {} });
      return null;
    } catch (err) {
      return err;
    }
  })();
  assert.ok(missing);
  assert.strictEqual(missing.code, "STAGING_SEED_PASSWORD_MISSING");
  assert.ok(!/password=/i.test(missing.message));

  assert.throws(
    () =>
      resolveStagingSeedConfig({
        nodeEnv: "production",
        env: { STAGING_SEED_PASSWORD: "short" },
      }),
    (err) => err.code === "STAGING_SEED_PASSWORD_WEAK" && !String(err.message).includes("short")
  );

  const cfg = resolveStagingSeedConfig({
    nodeEnv: "production",
    env: { STAGING_SEED_PASSWORD: "StagingPass9x" },
  });
  assert.strictEqual(cfg.accounts.customerA.email, DEFAULT_EMAILS.customerA);
  assert.strictEqual(cfg.accounts.providerA.approved, true);
  assert.strictEqual(cfg.accounts.providerB.approved, false);
  assert.strictEqual(cfg.accounts.supplier.role, "SUPPLIER");
  assert.strictEqual(cfg.accounts.customerB.password, "StagingPass9x");

  const perAccount = resolveStagingSeedConfig({
    nodeEnv: "development",
    env: {
      STAGING_SEED_PASSWORD: "SharedPass9x",
      STAGING_CUSTOMER_A_EMAIL: "a.custom@elofix.test",
      STAGING_CUSTOMER_A_PASSWORD: "CustomerA9x",
    },
  });
  assert.strictEqual(perAccount.accounts.customerA.email, "a.custom@elofix.test");
  assert.strictEqual(perAccount.accounts.customerA.password, "CustomerA9x");
  assert.strictEqual(perAccount.accounts.customerB.password, "SharedPass9x");

  console.log("stagingSeed.config.test.js: all passed");
}

run();
