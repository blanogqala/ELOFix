import { describe, expect, it } from 'vitest';
import { buildBranchesNearbyParams } from '@/lib/api/stores';
import {
  ALL_MATERIALS_CATEGORY_SCOPE,
  ALL_MATERIALS_DISCOVERY,
  isAllMaterialsDiscovery,
  marketplaceBranchEmptyHint,
  marketplaceBranchListHint,
} from './allMaterialsDiscovery';

describe('All Materials discovery', () => {
  it('uses one scope token that is not a category id', () => {
    expect(ALL_MATERIALS_CATEGORY_SCOPE).toBe('all');
    expect(ALL_MATERIALS_DISCOVERY).toEqual({ categoryId: 'all', name: 'All Materials' });
    expect(isAllMaterialsDiscovery('all')).toBe(true);
    expect(isAllMaterialsDiscovery(' ALL ')).toBe(false);
    expect(isAllMaterialsDiscovery('all-materials')).toBe(false);
  });

  it('sends the same nearby categoryId for customer and provider', () => {
    const location = { city: 'Cape Town', area: 'Bellville', lat: -33.89, lng: 18.63 };
    const allMaterials = buildBranchesNearbyParams({
      ...location,
      categoryId: ALL_MATERIALS_DISCOVERY.categoryId,
    });
    const tiling = buildBranchesNearbyParams({ ...location, categoryId: 'tiling-id' });
    expect(allMaterials.categoryId).toBe('all');
    expect(tiling.categoryId).toBe('tiling-id');
    expect(allMaterials.city).toBe(tiling.city);
    expect(allMaterials.area).toBe(tiling.area);
  });

  it('describes all-categories suppliers without treating All Materials as a stocked category', () => {
    const selection = ALL_MATERIALS_DISCOVERY;
    expect(marketplaceBranchListHint(selection, 'customer')).toMatch(/every material category/);
    expect(marketplaceBranchListHint(selection, 'provider')).toMatch(/every material category/);
    expect(marketplaceBranchEmptyHint(selection, 'customer')).toMatch(/every material category/);
    expect(marketplaceBranchEmptyHint({ categoryId: 'paint', name: 'Paint' }, 'customer')).toBe(
      'No nearby branches supply Paint for this address. Try another category or area.'
    );
    expect(marketplaceBranchListHint({ categoryId: 'paint', name: 'Paint' }, 'provider')).toBe(
      'Branches supplying Paint, nearest to the job site first.'
    );
  });
});
