/**
 * Runs `prisma migrate dev` only in non-production environments.
 * Production deployments must use `prisma migrate deploy` (see npm run prisma:deploy).
 */
require("dotenv/config");
const { spawnSync } = require("child_process");

if (process.env.NODE_ENV === "production") {
  console.error(
    "[prisma] migrate dev is not allowed when NODE_ENV=production. Use: npm run prisma:deploy"
  );
  process.exit(1);
}

const extra = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", "migrate", "dev", ...extra], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "development" },
});

process.exit(result.status === null ? 1 : result.status);
