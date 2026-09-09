/**
 * Production admin seed fail-closed.
 * Run: node tests/adminSeed.failClosed.test.js
 */
const assert = require("assert");
const {
  resolveAdminSeedConfig,
  isStrongEnoughAdminPassword,
} = require("../src/utils/adminSeedConfig");

function run() {
  assert.strictEqual(isStrongEnoughAdminPassword("Admin@123"), false);
  assert.strictEqual(isStrongEnoughAdminPassword("StrongAdmin1"), true);

  const dev = resolveAdminSeedConfig({ nodeEnv: "development", env: {} });
  assert.strictEqual(dev.email, "admin@elofix.com");
  assert.strictEqual(dev.password, "Admin@123");

  assert.throws(
    () => resolveAdminSeedConfig({ nodeEnv: "production", env: {} }),
    (err) => err.code === "ADMIN_SEED_CONFIG_MISSING" && !String(err.message).includes("Admin@123")
  );

  assert.throws(
    () =>
      resolveAdminSeedConfig({
        nodeEnv: "production",
        env: {
          ADMIN_EMAIL: "admin@elofix.com",
          ADMIN_PASSWORD: "Admin@123",
          ADMIN_NAME: "ELOFix Admin",
        },
      }),
    (err) => err.code === "ADMIN_SEED_PASSWORD_WEAK" && !String(err.message).toLowerCase().includes("admin@123")
  );

  const prod = resolveAdminSeedConfig({
    nodeEnv: "production",
    env: {
      ADMIN_EMAIL: "ops@elofix.com",
      ADMIN_PASSWORD: "SecureAdmin9x",
      ADMIN_NAME: "Ops Admin",
    },
  });
  assert.strictEqual(prod.email, "ops@elofix.com");
  assert.strictEqual(prod.name, "Ops Admin");
  assert.strictEqual(prod.password, "SecureAdmin9x");

  console.log("adminSeed.failClosed.test.js: all passed");
}

run();
