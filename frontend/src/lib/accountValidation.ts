/**
 * Shared account-field rules for register / reset / change-password.
 * Keep in sync with elofix-backend/src/utils/accountValidation.util.js
 */

export const PASSWORD_MIN_LENGTH = 8;

/** Letters (unicode), spaces, hyphens, apostrophes — no digits. */
const PERSON_NAME_RE = /^[\p{L}][\p{L}\s'-]*$/u;

/** Requires local-part@domain.tld with a real TLD (rejects "m@gmail"). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export type PasswordChecks = {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
};

export function getPasswordChecks(password: string): PasswordChecks {
  const value = String(password ?? '');
  return {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    uppercase: HAS_UPPER.test(value),
    lowercase: HAS_LOWER.test(value),
    number: HAS_DIGIT.test(value),
    special: HAS_SPECIAL.test(value),
  };
}

export function isPasswordValid(password: string): boolean {
  const c = getPasswordChecks(password);
  return c.minLength && c.uppercase && c.lowercase && c.number && c.special;
}

export function passwordValidationMessage(password: string): string | null {
  if (isPasswordValid(password)) return null;
  return (
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include ` +
    'an uppercase letter, a lowercase letter, a number, and a special character.'
  );
}

export function isValidPersonName(name: string): boolean {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < 2) return false;
  if (/\d/.test(trimmed)) return false;
  return PERSON_NAME_RE.test(trimmed);
}

export function personNameValidationMessage(name: string): string | null {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Full name is required.';
  if (trimmed.length < 2) return 'Please enter your full name.';
  if (/\d/.test(trimmed) || !PERSON_NAME_RE.test(trimmed)) {
    return 'Name can only contain letters, spaces, hyphens, and apostrophes — no numbers.';
  }
  return null;
}

/** Live hint for letters-only rule; null when empty or valid for that rule. */
export function personNameLettersOnlyHint(name: string): string | null {
  const value = String(name ?? '');
  if (!value.trim()) return null;
  if (/\d/.test(value) || !PERSON_NAME_RE.test(value.trim())) {
    return 'Letters only — no numbers.';
  }
  return null;
}

export function isValidEmail(email: string): boolean {
  const trimmed = String(email ?? '').trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return EMAIL_RE.test(trimmed);
}

export function emailValidationMessage(email: string): string | null {
  if (isValidEmail(email)) return null;
  return 'Please enter a valid email address (e.g. name@example.com).';
}

/** SA-friendly: optional +, digits/spaces/dashes/parens, at least 10 digits overall length. */
const PHONE_RE = /^\+?[\d\s\-()]{10,}$/;

export function isValidPhone(phone: string): boolean {
  const trimmed = String(phone ?? '').trim();
  if (!trimmed) return false;
  if (!PHONE_RE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export function phoneValidationMessage(phone: string): string | null {
  const trimmed = String(phone ?? '').trim();
  if (!trimmed) return 'Phone number is required.';
  if (!isValidPhone(trimmed)) {
    return 'Please enter a valid phone number (e.g. 073 123 4567).';
  }
  return null;
}

export const PASSWORD_REQUIREMENT_LABELS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'minLength', label: `At least ${PASSWORD_MIN_LENGTH} characters` },
  { key: 'uppercase', label: 'One uppercase letter' },
  { key: 'lowercase', label: 'One lowercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character (!@#$%…)' },
];
