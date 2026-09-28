import { describe, expect, it } from 'vitest';
import { PRECACHE_URLS as listedInWorker } from '../../scripts/pwaPrecache.mjs';
import { PRECACHE_URLS } from './cachePolicy';

describe('precache URL list', () => {
  it('uses the same stable files in the worker and the build', () => {
    expect([...PRECACHE_URLS]).toEqual(listedInWorker);
  });
});
