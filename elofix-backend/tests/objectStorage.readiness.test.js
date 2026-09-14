/**
 * Durable storage readiness: production requires S3 unless ELOFIX_ALLOW_LOCAL_UPLOADS
 * with an explicit absolute UPLOAD_ROOT.
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

  const prodDiskIncomplete = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    ELOFIX_ALLOW_LOCAL_UPLOADS: "true",
  });
  assert.strictEqual(prodDiskIncomplete.ok, false);
  assert.strictEqual(prodDiskIncomplete.storage, "invalid");

  const prodDiskRelative = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    ELOFIX_ALLOW_LOCAL_UPLOADS: "true",
    UPLOAD_ROOT: "uploads",
  });
  assert.strictEqual(prodDiskRelative.ok, false);

  const prodDiskOk = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    ELOFIX_ALLOW_LOCAL_UPLOADS: "true",
    UPLOAD_ROOT: "/opt/render/project/src/uploads",
  });
  assert.strictEqual(prodDiskOk.ok, true);
  assert.strictEqual(prodDiskOk.storage, "ok");

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
