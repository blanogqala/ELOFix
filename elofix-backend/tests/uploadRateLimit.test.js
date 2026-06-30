const assert = require("assert");
const {
  UPLOAD_CATEGORIES,
  LIMITS_PER_HOUR,
  hourWindowKey,
} = require("../src/constants/uploadRateLimit.constants");

function testLimits() {
  assert.strictEqual(LIMITS_PER_HOUR[UPLOAD_CATEGORIES.PROVIDER_DOCUMENT], 20);
  assert.strictEqual(LIMITS_PER_HOUR[UPLOAD_CATEGORIES.JOB_IMAGE], 100);
  assert.strictEqual(LIMITS_PER_HOUR[UPLOAD_CATEGORIES.COMPLETION_EVIDENCE], 50);
  assert.strictEqual(LIMITS_PER_HOUR[UPLOAD_CATEGORIES.SUPPLIER_IMAGE], 100);
}

function testHourWindowKey() {
  const key = hourWindowKey(new Date("2026-06-24T15:42:00.000Z"));
  assert.strictEqual(key, "2026-06-24T15");
}

function run() {
  testLimits();
  testHourWindowKey();
  console.log("uploadRateLimit.test.js: all passed");
}

run();
