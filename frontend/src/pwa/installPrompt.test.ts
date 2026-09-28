import { describe, expect, it } from 'vitest';
import { isIosInstallSurface } from './installPrompt';

describe('iPhone install guidance', () => {
  it('recognizes iPhone, iPad, and touch iPads reporting a Mac platform', () => {
    expect(isIosInstallSurface('iPhone', 'iPhone', 5)).toBe(true);
    expect(isIosInstallSurface('iPad', 'iPad', 5)).toBe(true);
    expect(isIosInstallSurface('Safari', 'MacIntel', 5)).toBe(true);
  });
  it('does not show iPhone instructions on Android and desktop', () => {
    expect(isIosInstallSurface('Android', 'Linux armv8', 5)).toBe(false);
    expect(isIosInstallSurface('Chrome', 'Win32', 0)).toBe(false);
  });
});
