/**
 * Avatar URL preservation on Google login.
 * Run: node tests/avatarUrl.util.test.js
 */
const assert = require("assert");
const {
  isPlatformHostedAvatarUrl,
  shouldSyncGoogleAvatarOnLogin,
} = require("../src/utils/avatarUrl.util");

function testPlatformHosted() {
  assert.strictEqual(isPlatformHostedAvatarUrl("/api/files/abc-123"), true);
  assert.strictEqual(isPlatformHostedAvatarUrl("/uploads/user/avatar.jpg"), true);
  assert.strictEqual(
    isPlatformHostedAvatarUrl("a6086cb6-2072-433a-9d93-b674ecb25a9f"),
    true
  );
  assert.strictEqual(
    isPlatformHostedAvatarUrl("https://lh3.googleusercontent.com/a/photo"),
    false
  );
}

function testShouldSync() {
  assert.strictEqual(shouldSyncGoogleAvatarOnLogin(""), true);
  assert.strictEqual(shouldSyncGoogleAvatarOnLogin(null), true);
  assert.strictEqual(
    shouldSyncGoogleAvatarOnLogin("https://lh3.googleusercontent.com/a/photo"),
    true
  );
  assert.strictEqual(
    shouldSyncGoogleAvatarOnLogin("/api/files/a6086cb6-2072-433a-9d93-b674ecb25a9f"),
    false
  );
  assert.strictEqual(
    shouldSyncGoogleAvatarOnLogin("https://cdn.example.com/my-photo.jpg"),
    false
  );
}

function run() {
  testPlatformHosted();
  testShouldSync();
  console.log("avatarUrl.util.test.js: all tests passed");
}

run();
