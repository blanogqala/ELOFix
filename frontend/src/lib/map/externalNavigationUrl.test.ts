/**
 * External navigation URL helpers.
 * Run: npx vitest run src/lib/map/externalNavigationUrl.test.ts
 */
import { describe, expect, it } from 'vitest';
import { buildExternalDirectionsUrl, buildExternalSearchUrl } from './externalNavigationUrl';

describe('buildExternalDirectionsUrl', () => {
  it('builds OSM directions from coordinates', () => {
    expect(buildExternalDirectionsUrl({ lat: -33.9, lng: 18.4 })).toBe(
      'https://www.openstreetmap.org/directions?to=-33.9%2C18.4'
    );
  });

  it('builds OSM directions from address', () => {
    expect(buildExternalDirectionsUrl({ address: 'Cape Town' })).toBe(
      'https://www.openstreetmap.org/directions?to=Cape%20Town'
    );
  });

  it('returns null when destination missing', () => {
    expect(buildExternalDirectionsUrl({})).toBeNull();
  });
});

describe('buildExternalSearchUrl', () => {
  it('builds OSM search URL', () => {
    expect(buildExternalSearchUrl('Sandton, Johannesburg')).toBe(
      'https://www.openstreetmap.org/search?query=Sandton%2C%20Johannesburg'
    );
  });

  it('returns null for empty query', () => {
    expect(buildExternalSearchUrl('  ')).toBeNull();
  });
});
