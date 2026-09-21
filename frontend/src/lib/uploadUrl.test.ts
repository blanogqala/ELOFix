import { describe, expect, it } from 'vitest';
import { API_ORIGIN, resolveUploadUrl } from './uploadUrl';

describe('resolveUploadUrl', () => {
  it('resolves relative /uploads paths against the API origin', () => {
    expect(resolveUploadUrl('/uploads/suppliers/x/products/a.jpg')).toBe(
      `${API_ORIGIN}/uploads/suppliers/x/products/a.jpg`
    );
  });

  it('leaves already-absolute http(s) URLs unchanged', () => {
    expect(resolveUploadUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
  });
});
