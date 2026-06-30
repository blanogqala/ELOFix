const assert = require("assert");
const {
  isBlockedUploadRelPath,
  isProtectedFileType,
  normalizeUploadRelPath,
} = require("../src/utils/fileAccessPolicy.util");
const {
  signFileAccessUrl,
  verifyFileAccessToken,
  signDocumentFields,
} = require("../src/services/fileAccess.service");

function testPathPolicy() {
  assert.strictEqual(
    isBlockedUploadRelPath("providers/abc/documents/idDoc-123.pdf"),
    true
  );
  assert.strictEqual(isBlockedUploadRelPath("jobs/job-1/quotations/q.pdf"), true);
  assert.strictEqual(isBlockedUploadRelPath("providers/abc/avatar/avatar-1.jpg"), false);
  assert.strictEqual(isBlockedUploadRelPath("jobs/user-1/job-123.jpg"), false);
  assert.strictEqual(normalizeUploadRelPath("../providers/x/documents/a.pdf"), null);
}

function testProtectedTypes() {
  assert.strictEqual(isProtectedFileType("idDoc"), true);
  assert.strictEqual(isProtectedFileType("jobQuotation"), true);
  assert.strictEqual(isProtectedFileType("avatar"), false);
  assert.strictEqual(isProtectedFileType("workImage"), false);
}

function testSignedUrls() {
  process.env.JWT_SECRET = "test-file-access-secret-key";
  const fileId = "11111111-1111-4111-8111-111111111111";
  const signed = signFileAccessUrl(fileId, 120);
  const url = new URL(signed, "http://localhost:5000");
  const access = url.searchParams.get("access");
  const exp = url.searchParams.get("exp");
  assert.ok(verifyFileAccessToken(fileId, access, exp));
  assert.strictEqual(verifyFileAccessToken(fileId, access, String(Number(exp) - 10)), false);
}

function testSignDocumentFields() {
  process.env.JWT_SECRET = "test-file-access-secret-key";
  const docs = signDocumentFields({
    idDoc: {
      fileId: "11111111-1111-4111-8111-111111111111",
      url: "/api/files/11111111-1111-4111-8111-111111111111",
      type: "idDoc",
      status: "pending",
    },
    avatar: {
      fileId: "22222222-2222-4222-8222-222222222222",
      url: "/api/files/22222222-2222-4222-8222-222222222222",
      type: "avatar",
    },
  });
  assert.ok(docs.idDoc.url.includes("access="));
  assert.ok(docs.idDoc.url.includes("exp="));
  assert.strictEqual(docs.avatar.url, "/api/files/22222222-2222-4222-8222-222222222222");
}

function run() {
  testPathPolicy();
  testProtectedTypes();
  testSignedUrls();
  testSignDocumentFields();
  console.log("uploadSecurity.test.js: all passed");
}

run();
