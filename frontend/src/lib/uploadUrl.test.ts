import { describe, expect, it } from 'vitest';
import { API_ORIGIN, resolveUploadUrl } from './uploadUrl';

describe('resolveUploadUrl', () => {
  it('resolves relative /uploads paths against the API origin', () => {
    expect(resolveUploadUrl('/uploads/suppliers/x/products/a.jpg')).toBe(
      `${API_ORIGIN}/uploads/suppliers/x/products/a.jpg`
    );
  });

  it('resolves /api/files ids against the API origin', () => {
    expect(resolveUploadUrl('/api/files/ac836ba1-3d7a-4aae-ade6-e098d428ce5a')).toBe(
      `${API_ORIGIN}/api/files/ac836ba1-3d7a-4aae-ade6-e098d428ce5a`
    );
  });

  it('rewrites same-path absolute URLs that pointed at the SPA origin', () => {
    expect(resolveUploadUrl('http://localhost:8080/api/files/ac836ba1-3d7a-4aae-ade6-e098d428ce5a')).toBe(
      `${API_ORIGIN}/api/files/ac836ba1-3d7a-4aae-ade6-e098d428ce5a`
    );
    expect(resolveUploadUrl('http://192.168.101.120:8080/uploads/suppliers/x/category-images/a.jpg')).toBe(
      `${API_ORIGIN}/uploads/suppliers/x/category-images/a.jpg`
    );
  });

  it('leaves already-absolute http(s) URLs unchanged', () => {
    expect(resolveUploadUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
  });
});
