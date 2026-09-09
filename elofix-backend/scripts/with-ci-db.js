/**
 * Run a command with the disposable CI database URL and safe PayFast sandbox env.
 * Usage: node scripts/with-ci-db.js npx prisma migrate deploy
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.ci-phasea"),
  override: true,
});

if (!process.env.PAYFAST_MERCHANT_ID) process.env.PAYFAST_MERCHANT_ID = "ci-sandbox-merchant-id";
if (!process.env.PAYFAST_MERCHANT_KEY) process.env.PAYFAST_MERCHANT_KEY = "ci-sandbox-merchant-key";
if (!process.env.PAYFAST_MODE) process.env.PAYFAST_MODE = "sandbox";
if (!process.env.ENABLED_PAYMENT_PROVIDERS) process.env.ENABLED_PAYMENT_PROVIDERS = "payfast";
if (!process.env.NODE_ENV) process.env.NODE_ENV = "test";

const { spawnSync } = require("child_process");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/with-ci-db.js <command> [args...]");
  process.exit(1);
}
const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: true,
  cwd: require("path").join(__dirname, ".."),
});
process.exit(result.status == null ? 1 : result.status);
