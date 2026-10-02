/**
 * Safety gate for marketplace Playwright fixtures.
 * No database client — safe to unit test without DATABASE_URL.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const ALLOWED_DATABASES = new Set(["elofix", "elofix_ci", "elofix_ci_phasea"]);

function assertSafeE2eDatabase(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("Refusing to seed marketplace E2E fixtures when NODE_ENV=production");
  }
  const raw = String(env.DATABASE_URL || "").trim();
  if (!raw) throw new Error("Refusing to seed marketplace E2E fixtures without DATABASE_URL");
  let host = "";
  let database = "";
  try {
    const parsed = new URL(raw.replace(/^postgres(ql)?:/i, "http:"));
    host = parsed.hostname.toLowerCase();
    database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("/")[0];
  } catch {
    throw new Error("Refusing to seed marketplace E2E fixtures: DATABASE_URL is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed marketplace E2E fixtures on non-local database host "${host}"`);
  }
  if (!ALLOWED_DATABASES.has(database)) {
    throw new Error(`Refusing to seed marketplace E2E fixtures on database "${database}"`);
  }
}

module.exports = {
  ALLOWED_DATABASES,
  assertSafeE2eDatabase,
};
