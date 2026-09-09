/**
 * Job-request image upload must PUT object storage once.
 * Run: node tests/jobImageUpload.storage.test.js
 */
require("dotenv").config();
const assert = require("assert");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { UPLOAD_ROOT } = require("../src/middleware/upload.middleware");
const objectStorage = require("../src/services/objectStorage.service");
const { registerUploadedFile } = require("../src/services/fileStorage.service");
const { signFileAccessUrl, verifyFileAccessToken } = require("../src/services/fileAccess.service");
const { runTestMain } = require("./helpers/shutdown");

if (!process.env.DATABASE_URL) {
  console.log("jobImageUpload.storage.test.js: skip (DATABASE_URL not set)");
  process.exit(0);
}

const prisma = require("../src/config/prisma");

async function run() {
  const controllerSrc = fs.readFileSync(
    path.join(__dirname, "../src/controllers/job.controller.js"),
    "utf8"
  );
  assert.ok(
    !controllerSrc.includes("mirrorMulterFile"),
    "uploadJobImage must not call mirrorMulterFile"
  );

  const store = new Map();
  objectStorage.setTestMemoryStore(store);
  const orig = objectStorage.putLocalFile;
  let puts = 0;
  objectStorage.putLocalFile = async (...args) => {
    puts += 1;
    return orig.apply(objectStorage, args);
  };

  const rel = `jobs/${randomUUID()}/once.jpg`;
  const abs = path.join(UPLOAD_ROOT, rel.split("/").join(path.sep));
  await fsPromises.mkdir(path.dirname(abs), { recursive: true });
  await fsPromises.writeFile(abs, Buffer.from("job-image"));

  try {
    const stored = await registerUploadedFile(
      { path: abs, originalname: "once.jpg", mimetype: "image/jpeg" },
      { ownerUserId: randomUUID(), type: "jobRequestImage" }
    );
    assert.strictEqual(puts, 1, "exactly one durable object-storage write");
    const signed = signFileAccessUrl(stored.fileId);
    const url = new URL(signed, "http://localhost:5000");
    assert.ok(
      verifyFileAccessToken(stored.fileId, url.searchParams.get("access"), url.searchParams.get("exp"))
    );
    await prisma.storedFile.delete({ where: { id: stored.fileId } }).catch(() => {});
  } finally {
    objectStorage.putLocalFile = orig;
    objectStorage.setTestMemoryStore(null);
  }

  console.log("jobImageUpload.storage.test.js: all passed");
}

runTestMain(run);
