import { describe, expect, it } from 'vitest';
import {
  emailValidationMessage,
  isPasswordValid,
  isValidEmail,
  isValidPersonName,
  isValidPhone,
  passwordValidationMessage,
  personNameValidationMessage,
  phoneValidationMessage,
} from './accountValidation';

describe('accountValidation', () => {
  it('rejects incomplete emails like m@gmail', () => {
    expect(isValidEmail('m@gmail')).toBe(false);
    expect(emailValidationMessage('m@gmail')).toBeTruthy();
    expect(isValidEmail('name@example.com')).toBe(true);
  });

  it('rejects names with numbers', () => {
    expect(isValidPersonName('Hello World 1')).toBe(false);
    expect(personNameValidationMessage('Hello World 1')).toMatch(/no numbers/i);
    expect(isValidPersonName('Jane Doe')).toBe(true);
    expect(isValidPersonName("O'Connor")).toBe(true);
  });

  it('requires strong passwords', () => {
    expect(isPasswordValid('password')).toBe(false);
    expect(isPasswordValid('Password1')).toBe(false);
    expect(isPasswordValid('Password1!')).toBe(true);
    expect(passwordValidationMessage('short')).toBeTruthy();
    expect(passwordValidationMessage('Password1!')).toBeNull();
  });

  it('validates phone numbers', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('071')).toBe(false);
    expect(isValidPhone('0733464466')).toBe(true);
    expect(phoneValidationMessage('071')).toBeTruthy();
    expect(phoneValidationMessage('0733464466')).toBeNull();
  });
});
