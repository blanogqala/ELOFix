/**
 * Auto job acceptance unit tests (no DB).
 * Run: node tests/completionDeadline.test.js
 */
const assert = require("assert");
const {
  appendTimelineEventIfAbsent,
  hasTimelineEventType,
  normalizeTimelineEvents,
} = require("../src/utils/jobTimeline.util");
const { isEligibleForAutoAccept } = require("../src/utils/completionDeadline.util");

function testNormalizeTimelineEvents() {
  assert.deepStrictEqual(normalizeTimelineEvents(null), []);
  assert.deepStrictEqual(normalizeTimelineEvents([{ type: "X", at: "2026-01-01T00:00:00.000Z" }]).length, 1);
  assert.deepStrictEqual(
    normalizeTimelineEvents([{ type: "X" }, { at: "y" }, { type: "Y", at: "2026-01-01T00:00:00.000Z" }]).length,
    1
  );
}

function testAppendTimelineEventIfAbsent() {
  const base = {};
  const withEvent = appendTimelineEventIfAbsent(base, {
    type: "AUTO_ACCEPTED",
    at: "2026-06-01T12:00:00.000Z",
    source: "completion_deadline_cron",
  });
  assert.strictEqual(withEvent.timelineEvents.length, 1);
  assert.strictEqual(withEvent.timelineEvents[0].type, "AUTO_ACCEPTED");
  assert.strictEqual(withEvent.timelineEvents[0].source, "completion_deadline_cron");

  const again = appendTimelineEventIfAbsent(withEvent, {
    type: "AUTO_ACCEPTED",
    at: "2026-06-02T12:00:00.000Z",
    source: "completion_deadline_cron",
  });
  assert.strictEqual(again.timelineEvents.length, 1);
  assert.strictEqual(again.timelineEvents[0].at, "2026-06-01T12:00:00.000Z");
}

function testHasTimelineEventType() {
  const meta = appendTimelineEventIfAbsent({}, {
    type: "AUTO_ACCEPTED",
    at: "2026-06-01T12:00:00.000Z",
  });
  assert.strictEqual(hasTimelineEventType(meta, "AUTO_ACCEPTED"), true);
  assert.strictEqual(hasTimelineEventType(meta, "CUSTOMER_CONFIRMED"), false);
}

function testIsEligibleForAutoAccept() {
  const past = new Date("2020-01-01T00:00:00.000Z").getTime();

  assert.strictEqual(
    isEligibleForAutoAccept(
      { status: "IN_PROGRESS" },
      { statusOverride: "AWAITING_CONFIRMATION", confirmationDeadlineAt: "2020-01-01T00:00:00.000Z" },
      past + 1
    ),
    true
  );

  assert.strictEqual(
    isEligibleForAutoAccept(
      { status: "IN_PROGRESS" },
      { statusOverride: "AWAITING_CONFIRMATION", confirmationDeadlineAt: "2099-01-01T00:00:00.000Z" },
      past + 1
    ),
    false
  );

  assert.strictEqual(
    isEligibleForAutoAccept(
      { status: "IN_PROGRESS" },
      { statusOverride: "DISPUTED", confirmationDeadlineAt: "2020-01-01T00:00:00.000Z" },
      past + 1
    ),
    false
  );

  assert.strictEqual(
    isEligibleForAutoAccept(
      { status: "IN_PROGRESS" },
      { statusOverride: "AWAITING_CONFIRMATION" },
      past + 1
    ),
    false
  );
}

function testIdempotentTimelineOnDoubleAppend() {
  let meta = {};
  for (let i = 0; i < 3; i++) {
    meta = appendTimelineEventIfAbsent(meta, {
      type: "AUTO_ACCEPTED",
      at: `2026-06-0${i + 1}T12:00:00.000Z`,
      source: "completion_deadline_cron",
    });
  }
  assert.strictEqual(meta.timelineEvents.length, 1);
  assert.strictEqual(hasTimelineEventType(meta, "AUTO_ACCEPTED"), true);
}

testNormalizeTimelineEvents();
testAppendTimelineEventIfAbsent();
testHasTimelineEventType();
testIsEligibleForAutoAccept();
testIdempotentTimelineOnDoubleAppend();
console.log("completionDeadline.test.js: OK");
