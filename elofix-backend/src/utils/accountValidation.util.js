/**
 * Shared account-field rules for register / reset / change-password.
 * Keep in sync with frontend/src/lib/accountValidation.ts
 */

const AppError = require("./AppError");

const PASSWORD_MIN_LENGTH = 8;

/** Letters (unicode), spaces, hyphens, apostrophes — no digits. */
const PERSON_NAME_RE = /^[\p{L}][\p{L}\s'-]*$/u;

/** Requires local-part@domain.tld with a real TLD (rejects "m@gmail"). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

function isValidPersonName(name) {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length < 2) return false;
  if (/\d/.test(trimmed)) return false;
  return PERSON_NAME_RE.test(trimmed);
}

function isValidEmail(email) {
  const trimmed = String(email ?? "").trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return EMAIL_RE.test(trimmed);
}

function isPasswordValid(password) {
  const value = String(password ?? "");
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    HAS_UPPER.test(value) &&
    HAS_LOWER.test(value) &&
    HAS_DIGIT.test(value) &&
    HAS_SPECIAL.test(value)
  );
}

function assertValidPersonName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new AppError("Full name is required", 400);
  if (!isValidPersonName(trimmed)) {
    throw new AppError(
      "Name can only contain letters, spaces, hyphens, and apostrophes — no numbers.",
      400
    );
  }
  return trimmed;
}

function assertValidEmail(email) {
  const trimmed = String(email ?? "").trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    throw new AppError("Please enter a valid email address (e.g. name@example.com).", 400);
  }
  return trimmed;
}

function assertValidPassword(password, label = "Password") {
  if (!isPasswordValid(password)) {
    throw new AppError(
      `${label} must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a lowercase letter, a number, and a special character.`,
      400
    );
  }
  return String(password);
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  isValidPersonName,
  isValidEmail,
  isPasswordValid,
  assertValidPersonName,
  assertValidEmail,
  assertValidPassword,
};
