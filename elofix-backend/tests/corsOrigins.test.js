/**
 * CORS origin sanitization and production readiness.
 * Run: node tests/corsOrigins.test.js
 */
const assert = require("assert");
const {
  sanitizeOrigin,
  getAllowedOrigins,
  isOriginAllowed,
  getCorsConfigReadiness,
  isWildcardOrigin,
} = require("../src/utils/corsOrigins.util");

function withEnv(overrides, fn) {
  const prev = { ...process.env };
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    process.env = prev;
  }
}

function testSanitize() {
  assert.strictEqual(sanitizeOrigin("https://elofix.co.za"), "https://elofix.co.za");
  assert.strictEqual(sanitizeOrigin("https://elofix.co.za/"), "https://elofix.co.za");
  assert.strictEqual(sanitizeOrigin("https://www.elofix.co.za"), "https://www.elofix.co.za");
  assert.strictEqual(sanitizeOrigin("*"), null);
  assert.strictEqual(sanitizeOrigin("https://*"), null);
  assert.strictEqual(sanitizeOrigin("*.elofix.co.za"), null);
  assert.strictEqual(sanitizeOrigin("ftp://elofix.co.za"), null);
  assert.strictEqual(sanitizeOrigin("not-a-url"), null);
  assert.strictEqual(sanitizeOrigin("https://user:pass@elofix.co.za"), null);
  assert.ok(isWildcardOrigin("*"));
}

function testProductionAllowlist() {
  withEnv(
    {
      NODE_ENV: "production",
      FRONTEND_URL: "https://elofix.co.za",
      FRONTEND_BASE_URL: "https://elofix.co.za",
      CORS_ALLOWED_ORIGINS: undefined,
    },
    () => {
      const allowed = getAllowedOrigins();
      assert.ok(allowed.includes("https://elofix.co.za"));
      assert.ok(!allowed.includes("https://www.elofix.co.za"));
      assert.ok(!allowed.includes("http://localhost:8080"));
      assert.strictEqual(isOriginAllowed("https://elofix.co.za", allowed), true);
      assert.strictEqual(isOriginAllowed("https://elofix.co.za/", allowed), true);
      assert.strictEqual(isOriginAllowed("https://www.elofix.co.za", allowed), false);
      assert.strictEqual(isOriginAllowed("https://evil.example", allowed), false);
      assert.strictEqual(isOriginAllowed(undefined, allowed), true);
      assert.strictEqual(isOriginAllowed("", allowed), true);
      assert.strictEqual(getCorsConfigReadiness().ok, true);
    }
  );
}

function testWwwAndNetlifyOnlyWhenConfigured() {
  withEnv(
    {
      NODE_ENV: "production",
      FRONTEND_URL: "https://elofix.co.za",
      CORS_ALLOWED_ORIGINS: "https://www.elofix.co.za, https://elofix-preview.netlify.app",
    },
    () => {
      const allowed = getAllowedOrigins();
      assert.strictEqual(isOriginAllowed("https://www.elofix.co.za", allowed), true);
      assert.strictEqual(isOriginAllowed("https://elofix-preview.netlify.app", allowed), true);
      assert.strictEqual(isOriginAllowed("https://evil.example", allowed), false);
    }
  );
}

function testWildcardAndMissingFailReadiness() {
  withEnv(
    {
      NODE_ENV: "production",
      FRONTEND_URL: "*",
      FRONTEND_BASE_URL: undefined,
      CORS_ALLOWED_ORIGINS: undefined,
    },
    () => {
      const allowed = getAllowedOrigins();
      assert.ok(!allowed.includes("*"));
      assert.strictEqual(getCorsConfigReadiness().ok, false);
    }
  );

  withEnv(
    {
      NODE_ENV: "production",
      FRONTEND_URL: undefined,
      FRONTEND_BASE_URL: undefined,
      CORS_ALLOWED_ORIGINS: undefined,
    },
    () => {
      assert.strictEqual(getCorsConfigReadiness().ok, false);
    }
  );
}

function testDevelopmentKeepsLocalhost() {
  withEnv(
    {
      NODE_ENV: "development",
      FRONTEND_URL: "http://localhost:8080",
    },
    () => {
      const allowed = getAllowedOrigins();
      assert.ok(allowed.includes("http://localhost:8080"));
      assert.strictEqual(getCorsConfigReadiness().ok, true);
    }
  );
}

function run() {
  testSanitize();
  testProductionAllowlist();
  testWwwAndNetlifyOnlyWhenConfigured();
  testWildcardAndMissingFailReadiness();
  testDevelopmentKeepsLocalhost();
  console.log("corsOrigins.test.js: all passed");
}

run();
