const assert = require("assert");
const { canJoinUserRoom } = require("../src/utils/socketAuth.util");
const { getAllowedOrigins, isOriginAllowed, createCorsOriginChecker } = require("../src/utils/corsOrigins.util");

function testCanJoinUserRoom() {
  assert.strictEqual(canJoinUserRoom("user-1", "user-1"), true);
  assert.strictEqual(canJoinUserRoom("user-1", "user-2"), false);
  assert.strictEqual(canJoinUserRoom(null, "user-1"), false);
  assert.strictEqual(canJoinUserRoom("user-1", null), false);
  assert.strictEqual(canJoinUserRoom(undefined, "user-1"), false);
}

async function testCorsOrigins() {
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = "development";
    process.env.FRONTEND_URL = "https://app.example.com";
    const allowed = getAllowedOrigins();
    assert.ok(allowed.includes("https://app.example.com"));
    assert.ok(allowed.includes("http://localhost:8080"));
    assert.strictEqual(isOriginAllowed(undefined, allowed), true);
    assert.strictEqual(isOriginAllowed("https://app.example.com", allowed), true);
    assert.strictEqual(isOriginAllowed("https://evil.example.com", allowed), false);

    const checker = createCorsOriginChecker(allowed);
    await new Promise((resolve, reject) => {
      checker("https://app.example.com", (err, ok) => {
        try {
          assert.strictEqual(err, null);
          assert.strictEqual(ok, true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    await new Promise((resolve, reject) => {
      checker("https://evil.example.com", (err, ok) => {
        try {
          assert.strictEqual(err, null);
          assert.strictEqual(ok, false);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  } finally {
    process.env = prevEnv;
  }
}

async function run() {
  testCanJoinUserRoom();
  await testCorsOrigins();
  console.log("socketAuth.test.js: all passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
