import assert from "node:assert/strict";
import {
  assertProductionFrontendConfig,
  resolveApiOrigin,
} from "./productionFrontendConfig.mjs";

function testDevelopmentAllowsMissingAndLocalhost() {
  const missing = assertProductionFrontendConfig({}, { mode: "development" });
  assert.equal(missing.ok, true);
  assert.equal(missing.production, false);
  assert.equal(missing.apiOrigin, "http://localhost:5000");

  const local = assertProductionFrontendConfig(
    { VITE_API_ORIGIN: "http://localhost:5000" },
    { mode: "development" }
  );
  assert.equal(local.ok, true);
  assert.equal(resolveApiOrigin({ VITE_API_ORIGIN: "http://localhost:5000" }), "http://localhost:5000");
}

function testProductionMissingUrlFails() {
  assert.throws(
    () => assertProductionFrontendConfig({ NODE_ENV: "production" }, { mode: "production" }),
    /requires VITE_API_ORIGIN/
  );
}

function testProductionLocalhostFails() {
  assert.throws(
    () =>
      assertProductionFrontendConfig(
        { NODE_ENV: "production", VITE_API_ORIGIN: "http://localhost:5000" },
        { mode: "production" }
      ),
    /cannot use a localhost API origin/
  );
  assert.throws(
    () =>
      assertProductionFrontendConfig(
        { NODE_ENV: "production", VITE_API_BASE_URL: "http://127.0.0.1:5000/api" },
        { mode: "production" }
      ),
    /cannot use a localhost API origin/
  );
}

function testProductionHttpsSucceeds() {
  const out = assertProductionFrontendConfig(
    {
      NODE_ENV: "production",
      VITE_API_ORIGIN: "https://api.elofix.example",
      VITE_API_BASE_URL: "https://api.elofix.example/api",
    },
    { mode: "production" }
  );
  assert.equal(out.ok, true);
  assert.equal(out.production, true);
  assert.equal(out.apiOrigin, "https://api.elofix.example");
}

testDevelopmentAllowsMissingAndLocalhost();
testProductionMissingUrlFails();
testProductionLocalhostFails();
testProductionHttpsSucceeds();
console.log("productionFrontendConfig.test.mjs: all passed");
