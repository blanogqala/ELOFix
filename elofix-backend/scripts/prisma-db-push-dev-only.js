/**
 * Runs `prisma db push` only for local development (NODE_ENV unset or "development").
 * Never use db push against production or staging.
 */
require("dotenv/config");
const { spawnSync } = require("child_process");

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production") {
  console.error("[prisma] db push is not allowed when NODE_ENV=production.");
  process.exit(1);
}
if (nodeEnv != null && nodeEnv !== "" && nodeEnv !== "development") {
  console.error(
    '[prisma] db push requires NODE_ENV=development (or unset). Refusing for NODE_ENV="' + nodeEnv + '".'
  );
  process.exit(1);
}

const extra = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", "db", "push", ...extra], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "development" },
});

process.exit(result.status === null ? 1 : result.status);
