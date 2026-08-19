/**
 * Mark-complete is blocked when the job is already awaiting confirmation.
 * Run: node tests/jobMarkComplete.util.test.js
 */
require("dotenv").config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}
const assert = require("assert");
const AppError = require("../src/utils/AppError");
const {
  assertNotAlreadyAwaitingConfirmation,
  ALREADY_AWAITING_CONFIRMATION_MSG,
} = require("../src/utils/jobMarkComplete.util");

function testThrowsWhenAlreadyAwaiting() {
  let threw = false;
  try {
    assertNotAlreadyAwaitingConfirmation("AWAITING_CONFIRMATION");
  } catch (e) {
    threw = true;
    assert.ok(e instanceof AppError);
    assert.strictEqual(e.statusCode, 400);
    assert.strictEqual(e.message, ALREADY_AWAITING_CONFIRMATION_MSG);
  }
  assert.strictEqual(threw, true);
}

function testAllowsInProgress() {
  assertNotAlreadyAwaitingConfirmation("IN_PROGRESS");
}

function run() {
  testThrowsWhenAlreadyAwaiting();
  testAllowsInProgress();
  console.log("jobMarkComplete.util.test.js: all passed (2/2)");
}

run();
