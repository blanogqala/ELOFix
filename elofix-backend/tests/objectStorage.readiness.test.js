/**
 * Durable storage readiness: production requires S3 unless ELOFIX_ALLOW_LOCAL_UPLOADS.
 * Run: node tests/objectStorage.readiness.test.js
 */
const assert = require("assert");
const objectStorage = require("../src/services/objectStorage.service");

function run() {
  const prodNoS3 = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
  });
  assert.strictEqual(prodNoS3.ok, false);
  assert.strictEqual(prodNoS3.storage, "invalid");

  const prodDisk = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    ELOFIX_ALLOW_LOCAL_UPLOADS: "true",
  });
  assert.strictEqual(prodDisk.ok, true);
  assert.strictEqual(prodDisk.storage, "ok");

  const prodS3 = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    S3_BUCKET: "elofix-uploads",
    S3_ACCESS_KEY_ID: "id",
    S3_SECRET_ACCESS_KEY: "secret",
  });
  assert.strictEqual(prodS3.ok, true);

  const dev = objectStorage.getDurableStorageReadiness({ NODE_ENV: "development" });
  assert.strictEqual(dev.ok, true);

  console.log("objectStorage.readiness.test.js: all passed");
}

run();
