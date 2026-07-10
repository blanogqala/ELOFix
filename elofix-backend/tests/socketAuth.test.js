const assert = require("assert");
const { canJoinUserRoom } = require("../src/utils/socketAuth.util");
const { getAllowedOrigins, isOriginAllowed } = require("../src/utils/corsOrigins.util");

function testCanJoinUserRoom() {
  assert.strictEqual(canJoinUserRoom("user-1", "user-1"), true);
  assert.strictEqual(canJoinUserRoom("user-1", "user-2"), false);
  assert.strictEqual(canJoinUserRoom(null, "user-1"), false);
  assert.strictEqual(canJoinUserRoom("user-1", null), false);
  assert.strictEqual(canJoinUserRoom(undefined, "user-1"), false);
}

function testCorsOrigins() {
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
  } finally {
    process.env = prevEnv;
  }
}

function run() {
  testCanJoinUserRoom();
  testCorsOrigins();
  console.log("socketAuth.test.js: all passed");
}

run();
