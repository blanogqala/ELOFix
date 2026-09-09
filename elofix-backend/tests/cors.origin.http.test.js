/**
 * CORS: allowed origin succeeds; unknown origin is rejected without HTTP 500.
 * Run: node tests/cors.origin.http.test.js
 */
require("dotenv").config();
const assert = require("assert");
const { listenApp } = require("./helpers/httpServer");

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-file-access-secret-key";

async function run() {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    FRONTEND_URL: process.env.FRONTEND_URL,
    FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  };
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "https://staging.example";
  delete process.env.FRONTEND_BASE_URL;
  delete process.env.CORS_ALLOWED_ORIGINS;

  delete require.cache[require.resolve("../src/utils/corsOrigins.util")];
  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const allowed = await fetch(`${h.baseUrl}/health`, {
      headers: { Origin: "https://staging.example" },
    });
    assert.strictEqual(allowed.status, 200);
    assert.strictEqual(allowed.headers.get("access-control-allow-origin"), "https://staging.example");

    const denied = await fetch(`${h.baseUrl}/health`, {
      headers: { Origin: "https://evil.example" },
    });
    assert.strictEqual(denied.status, 200);
    assert.strictEqual(denied.headers.get("access-control-allow-origin"), null);

    const preflight = await fetch(`${h.baseUrl}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.notStrictEqual(preflight.status, 500);
  } finally {
    await h.close();
    process.env.NODE_ENV = prev.NODE_ENV;
    process.env.FRONTEND_URL = prev.FRONTEND_URL;
    if (prev.FRONTEND_BASE_URL == null) delete process.env.FRONTEND_BASE_URL;
    else process.env.FRONTEND_BASE_URL = prev.FRONTEND_BASE_URL;
    if (prev.CORS_ALLOWED_ORIGINS == null) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = prev.CORS_ALLOWED_ORIGINS;
  }
  console.log("cors.origin.http.test.js: all passed");
}

const { runTestMain } = require("./helpers/shutdown");
runTestMain(run);
