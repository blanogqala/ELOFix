import { describe, expect, it } from 'vitest';
import { buildBranchesNearbyParams } from '@/lib/api/stores';
import { materialOrderBranchIdentity, shouldClearBranchCart } from './materialOrderIdentity';

describe('marketplace discovery helpers', () => {
  it('keeps location when the marketplace category changes', () => {
    const location = { city: 'Cape Town', area: 'Bellville', lat: -33.89, lng: 18.63 };
    const paint = buildBranchesNearbyParams({ ...location, categoryId: 'paint-id' });
    const electrical = buildBranchesNearbyParams({ ...location, categoryId: 'electrical-id' });
    expect(electrical.city).toBe(paint.city);
    expect(electrical.area).toBe(paint.area);
    expect(electrical.lat).toBe(paint.lat);
    expect(electrical.lng).toBe(paint.lng);
    expect(electrical.categoryId).toBe('electrical-id');
    expect(paint.categoryId).toBe('paint-id');
  });

  it('omits categoryId for callers that do not filter', () => {
    expect(buildBranchesNearbyParams({ city: 'Cape Town' }).categoryId).toBeUndefined();
  });

  it('clears a cart when the marketplace category or branch changes', () => {
    expect(
      shouldClearBranchCart({
        cartCount: 2,
        previousCategoryId: 'paint',
        nextCategoryId: 'tiles',
        previousBranchId: 'buco',
        nextBranchId: 'buco',
      })
    ).toBe(true);
    expect(
      shouldClearBranchCart({
        cartCount: 1,
        previousCategoryId: 'paint',
        nextCategoryId: 'paint',
        previousBranchId: 'buco',
        nextBranchId: 'builders',
      })
    ).toBe(true);
    expect(
      shouldClearBranchCart({
        cartCount: 1,
        previousCategoryId: 'paint',
        nextCategoryId: 'paint',
        previousBranchId: 'buco',
        nextBranchId: 'buco',
      })
    ).toBe(false);
    expect(
      shouldClearBranchCart({
        cartCount: 0,
        previousCategoryId: 'paint',
        nextCategoryId: 'tiles',
      })
    ).toBe(false);
  });

  it('checkout identity is the selected branch and does not include a category', () => {
    const identity = materialOrderBranchIdentity({
      id: 'branch-1',
      displayName: 'BUCO - Bellville',
      name: 'Bellville',
    });
    expect(identity).toEqual({
      storeId: 'branch-1',
      branchId: 'branch-1',
      storeName: 'BUCO - Bellville',
    });
    expect(identity).not.toHaveProperty('categoryId');
  });
});
