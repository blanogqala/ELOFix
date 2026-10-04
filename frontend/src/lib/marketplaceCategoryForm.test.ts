import { describe, expect, it } from 'vitest';
import { buildMarketplaceCategorySaveBody } from './marketplaceCategoryForm';

describe('buildMarketplaceCategorySaveBody', () => {
  it('keeps name, icon, image, and active, and omits description and sort order', () => {
    const body = buildMarketplaceCategorySaveBody({
      name: ' Roofing ',
      icon: 'Warehouse',
      imageUrl: '/uploads/marketplace/category-images/roof.png',
      isActive: true,
    });

    expect(body).toEqual({
      name: 'Roofing',
      icon: 'warehouse',
      imageUrl: '/uploads/marketplace/category-images/roof.png',
      isActive: true,
    });
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('sortOrder');
  });

  it('drops an icon key the API would reject', () => {
    const body = buildMarketplaceCategorySaveBody({
      name: 'Roofing',
      icon: '!!!',
      imageUrl: null,
      isActive: false,
    });
    expect(body.icon).toBeNull();
    expect(body.imageUrl).toBeNull();
  });
});
