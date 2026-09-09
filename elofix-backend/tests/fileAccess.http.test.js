/**
 * Real /uploads and /api/files access-path tests.
 * Run: node tests/fileAccess.http.test.js
 */
require("dotenv").config();
const assert = require("assert");
const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { UPLOAD_ROOT } = require("../src/middleware/upload.middleware");
const { listenApp, httpRequest } = require("./helpers/httpServer");
const { runTestMain } = require("./helpers/shutdown");

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-file-access-secret-key";
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function writeUpload(rel) {
  const abs = path.join(UPLOAD_ROOT, rel.split("/").join(path.sep));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from("testdata"));
  return abs;
}

async function testAnonymousStaticBlocks(baseUrl) {
  const files = [
    "providers/user-a/documents/idDoc-test.pdf",
    "jobs/job-a/quotations/quote.pdf",
    "jobs/job-a/completion/images/done.jpg",
    "jobs/job-a/completion/videos/done.mp4",
    "jobs/user-request-a/job-photo.jpg",
  ];
  for (const rel of files) {
    await writeUpload(rel);
    const res = await httpRequest(baseUrl, "GET", `/uploads/${rel}`);
    assert.strictEqual(res.status, 403, `${rel} should be forbidden anonymously`);
  }
}

async function testPublicStaticStillOpen(baseUrl) {
  const files = [
    "providers/user-a/avatar/avatar-1.jpg",
    "providers/user-a/work-posts/work-1.jpg",
    "suppliers/sup-a/product-images/prod-1.jpg",
    "suppliers/sup-a/store-logo/logo-1.jpg",
  ];
  for (const rel of files) {
    await writeUpload(rel);
    const res = await httpRequest(baseUrl, "GET", `/uploads/${rel}`);
    assert.strictEqual(res.status, 200, `${rel} should stay public`);
  }
}

async function testAuthorizedCompletionHttp(baseUrl) {
  if (!process.env.DATABASE_URL) {
    console.log("fileAccess.http.test.js: skip DB ACL cases (DATABASE_URL not set)");
    return;
  }
  const prisma = require("../src/config/prisma");
  const { registerFilePath } = require("../src/services/fileStorage.service");
  const { signFileAccessUrl } = require("../src/services/fileAccess.service");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const hashed = await bcrypt.hash("Pass12345!", 10);
  const customer = await prisma.user.create({
    data: {
      email: `fa.cust.${suffix}@example.com`,
      password: hashed,
      name: "File Customer",
      role: "CUSTOMER",
    },
  });
  const provider = await prisma.user.create({
    data: {
      email: `fa.prov.${suffix}@example.com`,
      password: hashed,
      name: "File Provider",
      role: "PROVIDER",
    },
  });
  const stranger = await prisma.user.create({
    data: {
      email: `fa.str.${suffix}@example.com`,
      password: hashed,
      name: "File Stranger",
      role: "CUSTOMER",
    },
  });
  const strangerProvider = await prisma.user.create({
    data: {
      email: `fa.strp.${suffix}@example.com`,
      password: hashed,
      name: "File Stranger Provider",
      role: "PROVIDER",
    },
  });
  const strangerSupplier = await prisma.user.create({
    data: {
      email: `fa.strs.${suffix}@example.com`,
      password: hashed,
      name: "File Stranger Supplier",
      role: "SUPPLIER",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `fa.admin.${suffix}@example.com`,
      password: hashed,
      name: "File Admin",
      role: "ADMIN",
    },
  });
  const job = await prisma.job.create({
    data: {
      title: "Completion privacy job",
      description: "test",
      price: 100,
      customerId: customer.id,
      providerId: provider.id,
    },
  });
  const rel = `jobs/${job.id}/completion/images/done-${suffix}.jpg`;
  const abs = await writeUpload(rel);
  const stored = await registerFilePath(abs, {
    ownerUserId: customer.id,
    type: "jobCompletionImage",
    originalName: "done.jpg",
    mimeType: "image/jpeg",
  });

  const anon = await httpRequest(baseUrl, "GET", stored.url);
  assert.strictEqual(anon.status, 403, "anonymous /api/files completion must be blocked");

  const strangerRes = await httpRequest(baseUrl, "GET", stored.url, {
    headers: { Authorization: `Bearer ${signToken(stranger)}` },
  });
  assert.strictEqual(strangerRes.status, 403, "unrelated user must be blocked");

  const customerRes = await httpRequest(baseUrl, "GET", stored.url, {
    headers: { Authorization: `Bearer ${signToken(customer)}` },
  });
  assert.strictEqual(customerRes.status, 200, "job customer must be allowed");

  const providerRes = await httpRequest(baseUrl, "GET", stored.url, {
    headers: { Authorization: `Bearer ${signToken(provider)}` },
  });
  assert.strictEqual(providerRes.status, 200, "job provider must be allowed");

  const adminRes = await httpRequest(baseUrl, "GET", stored.url, {
    headers: { Authorization: `Bearer ${signToken(admin)}` },
  });
  assert.strictEqual(adminRes.status, 200, "admin must be allowed");

  const signed = signFileAccessUrl(stored.fileId, 120);
  const signedRes = await httpRequest(baseUrl, "GET", signed);
  assert.strictEqual(signedRes.status, 200, "signed URL must be allowed");

  const publicAvatarRel = `providers/${provider.id}/avatar/avatar-${suffix}.jpg`;
  const publicAbs = await writeUpload(publicAvatarRel);
  const publicStored = await registerFilePath(publicAbs, {
    ownerUserId: provider.id,
    type: "avatar",
    originalName: "avatar.jpg",
    mimeType: "image/jpeg",
  });
  const publicRes = await httpRequest(baseUrl, "GET", publicStored.url);
  assert.strictEqual(publicRes.status, 200, "avatar must stay publicly fetchable via /api/files");

  const workRel = `providers/${provider.id}/work-posts/work-${suffix}.jpg`;
  const workAbs = await writeUpload(workRel);
  const workStored = await registerFilePath(workAbs, {
    ownerUserId: provider.id,
    type: "workImage",
    originalName: "work.jpg",
    mimeType: "image/jpeg",
  });
  const workRes = await httpRequest(baseUrl, "GET", workStored.url);
  assert.strictEqual(workRes.status, 200, "public provider portfolio must stay fetchable via /api/files");

  const productRel = `suppliers/${strangerSupplier.id}/product-images/prod-${suffix}.jpg`;
  const productAbs = await writeUpload(productRel);
  const productStored = await registerFilePath(productAbs, {
    ownerUserId: strangerSupplier.id,
    type: "supplier_product",
    originalName: "prod.jpg",
    mimeType: "image/jpeg",
  });
  const productRes = await httpRequest(baseUrl, "GET", productStored.url);
  assert.strictEqual(productRes.status, 200, "public supplier product image must stay fetchable via /api/files");

  const requestRel = `jobs/${customer.id}/job-${suffix}.jpg`;
  const requestAbs = await writeUpload(requestRel);
  const requestStored = await registerFilePath(requestAbs, {
    ownerUserId: customer.id,
    type: "jobRequestImage",
    originalName: "job.jpg",
    mimeType: "image/jpeg",
  });
  await prisma.job.update({
    where: { id: job.id },
    data: { images: [requestStored.url] },
  });

  const requestAnon = await httpRequest(baseUrl, "GET", `/uploads/${requestRel}`);
  assert.strictEqual(requestAnon.status, 403, "anonymous job-request /uploads must be blocked");

  const requestAnonApi = await httpRequest(baseUrl, "GET", requestStored.url);
  assert.strictEqual(requestAnonApi.status, 403, "anonymous job-request /api/files must be blocked");

  const requestStranger = await httpRequest(baseUrl, "GET", requestStored.url, {
    headers: { Authorization: `Bearer ${signToken(stranger)}` },
  });
  assert.strictEqual(requestStranger.status, 403, "unrelated customer must be blocked from job-request image");

  const requestStrangerProv = await httpRequest(baseUrl, "GET", requestStored.url, {
    headers: { Authorization: `Bearer ${signToken(strangerProvider)}` },
  });
  assert.strictEqual(requestStrangerProv.status, 403, "unrelated provider must be blocked from job-request image");

  const requestStrangerSup = await httpRequest(baseUrl, "GET", requestStored.url, {
    headers: { Authorization: `Bearer ${signToken(strangerSupplier)}` },
  });
  assert.strictEqual(requestStrangerSup.status, 403, "unrelated supplier must be blocked from job-request image");

  const requestCustomer = await httpRequest(baseUrl, "GET", requestStored.url, {
    headers: { Authorization: `Bearer ${signToken(customer)}` },
  });
  assert.strictEqual(requestCustomer.status, 200, "owning customer must be allowed job-request image");

  const requestProvider = await httpRequest(baseUrl, "GET", requestStored.url, {
    headers: { Authorization: `Bearer ${signToken(provider)}` },
  });
  assert.strictEqual(requestProvider.status, 200, "assigned provider must be allowed job-request image");

  const requestAdmin = await httpRequest(baseUrl, "GET", requestStored.url, {
    headers: { Authorization: `Bearer ${signToken(admin)}` },
  });
  assert.strictEqual(requestAdmin.status, 200, "admin must be allowed job-request image");
}

async function run() {
  const app = require("../src/app");
  const h = await listenApp(app);
  try {
    await testAnonymousStaticBlocks(h.baseUrl);
    await testPublicStaticStillOpen(h.baseUrl);
    await testAuthorizedCompletionHttp(h.baseUrl);
  } finally {
    await h.close();
  }
  console.log("fileAccess.http.test.js: all passed");
}

runTestMain(run);
