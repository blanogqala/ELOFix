import { describe, expect, it } from 'vitest';
import {
  buildPortfolioGalleryItems,
  filterWorkPostsByCategory,
  hasPortfolioGalleryItems,
} from '@/lib/portfolioGallery';
import type { WorkPost } from '@/types';

const deliveryPost: WorkPost = {
  id: 'post-delivery',
  categoryId: 'delivery',
  title: 'My Van',
  description: 'Delivery vehicle',
  images: ['/uploads/van.jpg'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const tilingPost: WorkPost = {
  id: 'post-tiling',
  categoryId: 'tiling',
  title: 'Kitchen tiles',
  description: 'Recent tiling job',
  images: ['/uploads/tiles.jpg', '/uploads/tiles-2.jpg'],
  createdAt: '2026-01-02T00:00:00.000Z',
};

describe('portfolioGallery', () => {
  it('returns no posts when category is missing', () => {
    expect(filterWorkPostsByCategory([deliveryPost, tilingPost])).toEqual([]);
    expect(buildPortfolioGalleryItems([deliveryPost, tilingPost], ['/legacy.jpg'])).toEqual([]);
  });

  it('filters work posts by category', () => {
    expect(filterWorkPostsByCategory([deliveryPost, tilingPost], 'delivery')).toEqual([deliveryPost]);
    expect(filterWorkPostsByCategory([deliveryPost, tilingPost], 'tiling')).toEqual([tilingPost]);
  });

  it('builds gallery items only for the selected category', () => {
    const deliveryItems = buildPortfolioGalleryItems([deliveryPost, tilingPost], [], 'delivery');
    expect(deliveryItems).toHaveLength(1);
    expect(deliveryItems[0]?.url).toBe('/uploads/van.jpg');
    expect(deliveryItems[0]?.caption).toBe('My Van');

    const tilingItems = buildPortfolioGalleryItems([deliveryPost, tilingPost], [], 'tiling');
    expect(tilingItems).toHaveLength(2);
    expect(tilingItems.every((item) => item.caption === 'Kitchen tiles')).toBe(true);
  });

  it('does not fall back to legacy portfolio images when category filter is active', () => {
    expect(buildPortfolioGalleryItems([], ['/legacy.jpg'], 'delivery')).toEqual([]);
    expect(hasPortfolioGalleryItems([], ['/legacy.jpg'], 'delivery')).toBe(false);
  });

  it('does not show legacy portfolio images without category context', () => {
    expect(buildPortfolioGalleryItems([], ['/legacy.jpg'])).toEqual([]);
    expect(hasPortfolioGalleryItems([], ['/legacy.jpg'])).toBe(false);
  });
});
