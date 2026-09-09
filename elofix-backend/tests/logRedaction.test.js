/**
 * Log URL redaction.
 * Run: node tests/logRedaction.test.js
 */
const assert = require("assert");
const { redactRequestUrl } = require("../src/utils/logRedaction.util");

function run() {
  assert.strictEqual(redactRequestUrl("/api/auth/login"), "/api/auth/login");
  const oauth = redactRequestUrl("/api/auth/google/callback?code=SECRETCODE&state=abc");
  assert.ok(oauth.includes("REDACTED"));
  assert.ok(!oauth.includes("SECRETCODE"));
  assert.ok(oauth.includes("state=abc"));

  const reset = redactRequestUrl("/api/auth/reset-password?token=RAWTOKEN&x=1");
  assert.ok(!reset.includes("RAWTOKEN"));
  assert.ok(reset.includes("REDACTED"));

  const files = redactRequestUrl("/api/files/abc?access=HMACVALUE&exp=123");
  assert.ok(!files.includes("HMACVALUE"));
  assert.ok(files.includes("exp=123"));

  console.log("logRedaction.test.js: all passed");
}

run();
