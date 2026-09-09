/**
 * Durable object storage fail-closed for critical uploads.
 * Run: node tests/fileStorage.durable.test.js
 */
require("dotenv").config();
const assert = require("assert");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { UPLOAD_ROOT } = require("../src/middleware/upload.middleware");
const objectStorage = require("../src/services/objectStorage.service");
const fileStorage = require("../src/services/fileStorage.service");
const { signFileAccessUrl } = require("../src/services/fileAccess.service");
const { listenApp, httpRequest } = require("./helpers/httpServer");
const { runTestMain } = require("./helpers/shutdown");

if (!process.env.DATABASE_URL) {
  console.log("fileStorage.durable.test.js: skip (DATABASE_URL not set)");
  process.exit(0);
}

const prisma = require("../src/config/prisma");

async function writeUpload(rel, bytes = "durable-bytes") {
  const abs = path.join(UPLOAD_ROOT, rel.split("/").join(path.sep));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(bytes));
  return abs;
}

async function testLocalDevWithoutS3() {
  objectStorage.setTestMemoryStore(null);
  const prevBucket = process.env.S3_BUCKET;
  const prevNode = process.env.NODE_ENV;
  delete process.env.S3_BUCKET;
  process.env.NODE_ENV = "development";
  try {
    const rel = `jobs/${randomUUID()}/dev-local.jpg`;
    const abs = await writeUpload(rel);
    const stored = await fileStorage.registerFilePath(abs, {
      type: "jobRequestImage",
      originalName: "dev-local.jpg",
      mimeType: "image/jpeg",
    });
    assert.ok(stored.fileId);
    const rec = await prisma.storedFile.findUnique({ where: { id: stored.fileId } });
    assert.ok(rec, "1. local-development upload without S3 still registers");
    await prisma.storedFile.delete({ where: { id: stored.fileId } }).catch(() => {});
  } finally {
    if (prevBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = prevBucket;
    process.env.NODE_ENV = prevNode;
  }
}

async function testProductionS3SuccessAndRemoteRetrieve() {
  const store = new Map();
  objectStorage.setTestMemoryStore(store);
  const rel = `jobs/${randomUUID()}/prod-ok.jpg`;
  const abs = await writeUpload(rel, "remote-body");
  const stored = await fileStorage.registerFilePath(abs, {
    type: "jobRequestImage",
    ownerUserId: randomUUID(),
    originalName: "prod-ok.jpg",
    mimeType: "image/jpeg",
  });
  assert.ok(store.has(rel.replace(/\\/g, "/")) || [...store.keys()].some((k) => k.endsWith("prod-ok.jpg")));
  await fs.unlink(abs);
  const found = await fileStorage.getRegisteredFile(stored.fileId);
  assert.ok(found, "5. retrievable after local file removal");
  assert.strictEqual(found.remoteOnly, true);

  const streamed = await objectStorage.streamLocalOrRemote(found.relPath, abs);
  assert.ok(streamed, "5. remote stream after local removal");
  const chunks = [];
  for await (const chunk of streamed.stream) chunks.push(chunk);
  assert.strictEqual(Buffer.concat(chunks).toString(), "remote-body");

  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-file-access-secret-key";
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    const signed = signFileAccessUrl(stored.fileId);
    const res = await httpRequest(h.baseUrl, "GET", signed);
    assert.strictEqual(res.status, 200, "6. authorized/signed private access still works");

    const publicRel = `providers/${randomUUID()}/work-posts/work-pub.jpg`;
    const publicAbs = await writeUpload(publicRel, "public-bytes");
    const pub = await fileStorage.registerFilePath(publicAbs, {
      type: "workImage",
      originalName: "work-pub.jpg",
      mimeType: "image/jpeg",
    });
    const pubRes = await httpRequest(h.baseUrl, "GET", pub.url);
    assert.strictEqual(pubRes.status, 200, "7. public files remain available");
    await prisma.storedFile.delete({ where: { id: pub.fileId } }).catch(() => {});
  } finally {
    await h.close();
  }

  await prisma.storedFile.delete({ where: { id: stored.fileId } }).catch(() => {});
  objectStorage.setTestMemoryStore(null);
}

async function withInjectedS3Failure(fn) {
  const store = new Map();
  objectStorage.setTestMemoryStore(store);
  const orig = objectStorage.putLocalFile;
  objectStorage.putLocalFile = async () => {
    throw new Error("injected s3 failure");
  };
  try {
    return await fn();
  } finally {
    objectStorage.putLocalFile = orig;
    objectStorage.setTestMemoryStore(null);
  }
}

async function testFreshUploadS3FailureDeletesDisposableFile() {
  const rel = `jobs/${randomUUID()}/fresh-fail.jpg`;
  const abs = await writeUpload(rel, "disposable-upload");
  let threw = null;
  await withInjectedS3Failure(async () => {
    try {
      await fileStorage.registerUploadedFile(
        { path: abs, originalname: "fresh-fail.jpg", mimetype: "image/jpeg" },
        { type: "jobRequestImage" }
      );
    } catch (e) {
      threw = e;
    }
  });
  assert.ok(threw, "1. fresh upload S3 failure returns controlled failure");
  assert.strictEqual(threw.statusCode, 503);
  const leftover = await prisma.storedFile.findFirst({ where: { relPath: rel.replace(/\\/g, "/") } });
  assert.ok(!leftover, "1. StoredFile row removed after failed fresh upload");
  const stillThere = await fs
    .stat(abs)
    .then(() => true)
    .catch(() => false);
  assert.strictEqual(stillThere, false, "1. disposable multer/temp file is cleaned on failure");
}

async function testLegacyFileS3FailurePreservesOriginal() {
  const rel = `jobs/${randomUUID()}/legacy-keep.jpg`;
  const abs = await writeUpload(rel, "pre-existing-legacy");
  let threw = null;
  await withInjectedS3Failure(async () => {
    try {
      await fileStorage.registerFilePath(abs, {
        type: "jobRequestImage",
        originalName: "legacy-keep.jpg",
        mimeType: "image/jpeg",
        deleteLocalOnFailure: false,
      });
    } catch (e) {
      threw = e;
    }
  });
  assert.ok(threw, "2. legacy registration S3 failure returns controlled failure");
  assert.strictEqual(threw.statusCode, 503);
  const leftover = await prisma.storedFile.findFirst({ where: { relPath: rel.replace(/\\/g, "/") } });
  assert.ok(!leftover, "2. StoredFile row created by the attempt is removed");
  const stillThere = await fs
    .stat(abs)
    .then((s) => s.isFile())
    .catch(() => false);
  assert.strictEqual(stillThere, true, "2. ORIGINAL pre-existing file still exists after S3 failure");
  await fs.unlink(abs).catch(() => {});
}

async function testGetOrRegisterRelPathDoesNotDeleteLegacyOnS3Failure() {
  const rel = `jobs/${randomUUID()}/legacy-rel.jpg`;
  const abs = await writeUpload(rel, "legacy-rel-bytes");
  let threw = null;
  await withInjectedS3Failure(async () => {
    try {
      await fileStorage.getOrRegisterRelPath(rel, {
        type: "jobRequestImage",
        originalName: "legacy-rel.jpg",
      });
    } catch (e) {
      threw = e;
    }
  });
  assert.ok(threw, "2b. getOrRegisterRelPath S3 failure is controlled");
  assert.strictEqual(threw.statusCode, 503);
  const leftover = await prisma.storedFile.findFirst({ where: { relPath: rel.replace(/\\/g, "/") } });
  assert.ok(!leftover, "2b. no leftover StoredFile");
  const stillThere = await fs
    .stat(abs)
    .then((s) => s.isFile())
    .catch(() => false);
  assert.strictEqual(stillThere, true, "2b. original file preserved via getOrRegisterRelPath");
  await fs.unlink(abs).catch(() => {});
}

async function testReadinessRequiresStorageInProduction() {
  const ready = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    S3_BUCKET: "",
    S3_ACCESS_KEY_ID: "",
    S3_SECRET_ACCESS_KEY: "",
  });
  assert.strictEqual(ready.ok, false, "8. production without durable storage is invalid");
  assert.strictEqual(ready.storage, "invalid");

  const okHttps = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    S3_BUCKET: "elofix-uploads",
    S3_ACCESS_KEY_ID: "id",
    S3_SECRET_ACCESS_KEY: "secret",
  });
  assert.strictEqual(okHttps.ok, true);
  assert.strictEqual(okHttps.storage, "ok");

  const localOk = objectStorage.getDurableStorageReadiness({ NODE_ENV: "development" });
  assert.strictEqual(localOk.ok, true);

  const diskOk = objectStorage.getDurableStorageReadiness({
    NODE_ENV: "production",
    ELOFIX_ALLOW_LOCAL_UPLOADS: "true",
  });
  assert.strictEqual(diskOk.ok, true);

  const prev = process.env.NODE_ENV;
  const prevAllow = process.env.ELOFIX_ALLOW_LOCAL_UPLOADS;
  const prevBucket = process.env.S3_BUCKET;
  objectStorage.setTestMemoryStore(null);
  process.env.NODE_ENV = "production";
  delete process.env.ELOFIX_ALLOW_LOCAL_UPLOADS;
  delete process.env.S3_BUCKET;
  try {
    const { getReadiness } = require("../src/services/readiness.service");
    const httpReady = await getReadiness();
    assert.strictEqual(httpReady.body.checks.storage, "invalid");
    assert.ok(!JSON.stringify(httpReady.body).toLowerCase().includes("secret"));
    assert.ok(!JSON.stringify(httpReady.body).includes("S3_ACCESS"));
  } finally {
    process.env.NODE_ENV = prev;
    if (prevAllow === undefined) delete process.env.ELOFIX_ALLOW_LOCAL_UPLOADS;
    else process.env.ELOFIX_ALLOW_LOCAL_UPLOADS = prevAllow;
    if (prevBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = prevBucket;
  }
}

async function run() {
  await testLocalDevWithoutS3();
  await testProductionS3SuccessAndRemoteRetrieve();
  await testFreshUploadS3FailureDeletesDisposableFile();
  await testLegacyFileS3FailurePreservesOriginal();
  await testGetOrRegisterRelPathDoesNotDeleteLegacyOnS3Failure();
  await testReadinessRequiresStorageInProduction();
  console.log("fileStorage.durable.test.js: all passed");
}

runTestMain(run);
