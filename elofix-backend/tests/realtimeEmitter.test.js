/**
 * Tests for src/utils/realtimeEmitter.js
 *
 * Verifies:
 * 1. emitDomainUpdate targets only the specified users (not arbitrary others)
 * 2. Admin room is emitted to when adminRoom:true
 * 3. Admin room is NOT emitted to by default
 * 4. emitDomainUpdate is safe when global.io is undefined (unit-test / CI)
 * 5. Emission errors do not throw (never roll back a financial transaction)
 * 6. User IDs are deduplicated
 * 7. Branch rooms are targeted correctly
 * 8. Missing domain/action logs a warning without throwing
 */
const assert = require("assert");

const { emitDomainUpdate } = require("../src/utils/realtimeEmitter");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIo() {
  const emissions = [];
  return {
    io: {
      to(room) {
        return {
          emit(event, payload) {
            emissions.push({ room, event, payload });
          },
        };
      },
    },
    emissions,
  };
}

function withGlobalIo(io, fn) {
  const prev = global.io;
  global.io = io;
  try {
    return fn();
  } finally {
    global.io = prev;
  }
}

// ─── Test 1: targets correct users ───────────────────────────────────────────
function testTargetsCorrectUsers() {
  const { io, emissions } = makeIo();
  withGlobalIo(io, () => {
    emitDomainUpdate({
      domain: "job",
      action: "status-changed",
      jobId: "job-abc",
      userIds: ["user-customer", "user-provider"],
    });
  });

  const rooms = emissions.map((e) => e.room);
  assert.ok(rooms.includes("user-customer"), "should emit to customer room");
  assert.ok(rooms.includes("user-provider"), "should emit to provider room");
  // Must NOT emit to unrelated rooms
  assert.ok(!rooms.includes("user-unrelated"), "must not emit to unrelated user");
  assert.ok(!rooms.includes("admin"), "must not emit to admin room unless requested");

  const payloads = emissions.map((e) => e.payload);
  payloads.forEach((p) => {
    assert.strictEqual(p.domain, "job");
    assert.strictEqual(p.action, "status-changed");
    assert.strictEqual(p.jobId, "job-abc");
    assert.ok(p.timestamp, "should have timestamp");
  });

  console.log("  ✓ targets correct users");
}

// ─── Test 2: admin room emitted when adminRoom:true ───────────────────────────
function testAdminRoomWhenRequested() {
  const { io, emissions } = makeIo();
  withGlobalIo(io, () => {
    emitDomainUpdate({
      domain: "dispute",
      action: "created",
      jobId: "job-xyz",
      disputeId: "disp-1",
      userIds: ["user-a", "user-b"],
      adminRoom: true,
    });
  });

  const rooms = emissions.map((e) => e.room);
  assert.ok(rooms.includes("admin"), "should emit to admin room when adminRoom:true");
  assert.ok(rooms.includes("user-a"), "should still emit to user-a");
  assert.ok(rooms.includes("user-b"), "should still emit to user-b");

  console.log("  ✓ admin room emitted when requested");
}

// ─── Test 3: admin room NOT emitted when adminRoom is default (false) ─────────
function testAdminRoomNotEmittedByDefault() {
  const { io, emissions } = makeIo();
  withGlobalIo(io, () => {
    emitDomainUpdate({
      domain: "job",
      action: "updated",
      jobId: "job-123",
      userIds: ["user-c"],
    });
  });

  const rooms = emissions.map((e) => e.room);
  assert.ok(!rooms.includes("admin"), "should NOT emit to admin room by default");

  console.log("  ✓ admin room not emitted by default");
}

// ─── Test 4: safe when global.io is undefined ─────────────────────────────────
function testSafeWhenNoIo() {
  const prev = global.io;
  global.io = undefined;
  try {
    // Must not throw
    emitDomainUpdate({
      domain: "payment",
      action: "paid",
      jobId: "job-789",
      userIds: ["user-x"],
    });
  } catch (e) {
    assert.fail(`emitDomainUpdate threw when global.io is undefined: ${e.message}`);
  } finally {
    global.io = prev;
  }

  console.log("  ✓ no-ops safely when global.io is undefined");
}

// ─── Test 5: emission error does not throw ────────────────────────────────────
function testEmissionErrorDoesNotThrow() {
  const brokenIo = {
    to() {
      return {
        emit() {
          throw new Error("Socket disconnected");
        },
      };
    },
  };
  withGlobalIo(brokenIo, () => {
    try {
      emitDomainUpdate({
        domain: "refund",
        action: "updated",
        jobId: "job-broken",
        userIds: ["user-broken"],
      });
    } catch (e) {
      assert.fail(`emitDomainUpdate must not propagate socket errors: ${e.message}`);
    }
  });

  console.log("  ✓ emission error does not throw");
}

// ─── Test 6: user IDs are deduplicated ───────────────────────────────────────
function testDeduplication() {
  const { io, emissions } = makeIo();
  withGlobalIo(io, () => {
    emitDomainUpdate({
      domain: "job",
      action: "cancelled",
      jobId: "job-dup",
      userIds: ["user-same", "user-same", "user-same"],
    });
  });

  const userRooms = emissions.filter((e) => e.room === "user-same");
  assert.strictEqual(userRooms.length, 1, "duplicate user IDs should only emit once");

  console.log("  ✓ user IDs are deduplicated");
}

// ─── Test 7: branch rooms ─────────────────────────────────────────────────────
function testBranchRooms() {
  const { io, emissions } = makeIo();
  withGlobalIo(io, () => {
    emitDomainUpdate({
      domain: "material-order",
      action: "status-changed",
      orderId: "order-br",
      branchIds: ["branch-42"],
    });
  });

  const rooms = emissions.map((e) => e.room);
  assert.ok(rooms.includes("branch:branch-42"), "should emit to branch:branchId room");

  console.log("  ✓ branch rooms targeted correctly");
}

// ─── Test 8: missing domain/action ────────────────────────────────────────────
function testMissingDomainNoThrow() {
  const { io } = makeIo();
  withGlobalIo(io, () => {
    try {
      emitDomainUpdate({ userIds: ["user-z"] }); // missing domain and action
    } catch (e) {
      assert.fail(`emitDomainUpdate must not throw on missing domain/action: ${e.message}`);
    }
  });

  console.log("  ✓ missing domain/action handled gracefully");
}

// ─── Test 9: payload never contains private/financial fields from the emitter ──
function testPayloadIsMinimal() {
  const { io, emissions } = makeIo();
  withGlobalIo(io, () => {
    emitDomainUpdate({
      domain: "payment",
      action: "paid",
      jobId: "job-min",
      userIds: ["user-min"],
      metadata: { someKey: "someValue" },
    });
  });

  assert.ok(emissions.length > 0);
  const payload = emissions[0].payload;
  // Must have only the allowed fields
  assert.strictEqual(payload.domain, "payment");
  assert.strictEqual(payload.action, "paid");
  assert.strictEqual(payload.jobId, "job-min");
  assert.ok(payload.timestamp);
  assert.deepStrictEqual(payload.metadata, { someKey: "someValue" });
  // Must NOT have arbitrary fields
  assert.ok(!("amount" in payload), "payload must not contain financial amount");
  assert.ok(!("cardNumber" in payload), "payload must not contain card data");

  console.log("  ✓ payload is minimal and does not leak private data");
}

// ─── Runner ───────────────────────────────────────────────────────────────────
function run() {
  console.log("realtimeEmitter.test.js");
  testTargetsCorrectUsers();
  testAdminRoomWhenRequested();
  testAdminRoomNotEmittedByDefault();
  testSafeWhenNoIo();
  testEmissionErrorDoesNotThrow();
  testDeduplication();
  testBranchRooms();
  testMissingDomainNoThrow();
  testPayloadIsMinimal();
  console.log("realtimeEmitter.test.js: all passed ✓");
}

run();
