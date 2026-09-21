import { describe, expect, it } from 'vitest';
import type { InventoryCategory, Product } from '@/types';
import {
  canonicalInventoryCategory,
  filterAndSortProducts,
  filterCatalogCategories,
  firstProductImageForCategory,
  formatCategoryLabel,
  mergeCatalogCategories,
  resolveCategoryImageUrl,
} from './catalogUtils';

function product(partial: Partial<Product> & { name: string }): Product {
  return {
    id: partial.id ?? partial.name,
    name: partial.name,
    category: partial.category ?? 'general',
    price: partial.price ?? 10,
    qualityTier: partial.qualityTier ?? 'medium',
    unit: partial.unit ?? 'unit',
    inStock: partial.inStock ?? true,
    ...partial,
  };
}

describe('canonicalInventoryCategory', () => {
  it('normalizes trim + lowercase and defaults empty to general', () => {
    expect(canonicalInventoryCategory('  Tiles ')).toBe('tiles');
    expect(canonicalInventoryCategory('')).toBe('general');
    expect(canonicalInventoryCategory(null)).toBe('general');
  });
});

describe('mergeCatalogCategories', () => {
  it('shows empty persisted categories with 0 products', () => {
    const persisted: InventoryCategory[] = [{ id: 'c1', name: 'tiles', sortOrder: 1 }];
    const merged = mergeCatalogCategories(persisted, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe('tiles');
    expect(merged[0].productCount).toBe(0);
    expect(merged[0].isLegacy).toBe(false);
  });

  it('merges persisted and product categories without duplicates', () => {
    const persisted: InventoryCategory[] = [
      { id: 'c1', name: 'tiles' },
      { id: 'c2', name: 'paint' },
    ];
    const products = [
      product({ name: 'Ceramic', category: 'Tiles' }),
      product({ name: 'Legacy Cement', category: 'cement' }),
    ];
    const merged = mergeCatalogCategories(persisted, products);
    expect(merged.map((c) => c.key).sort()).toEqual(['cement', 'paint', 'tiles']);
    expect(merged.find((c) => c.key === 'tiles')?.productCount).toBe(1);
    expect(merged.find((c) => c.key === 'paint')?.productCount).toBe(0);
    expect(merged.find((c) => c.key === 'cement')?.isLegacy).toBe(true);
  });

  it('keeps a legacy product category when metadata is missing', () => {
    const merged = mergeCatalogCategories(undefined, [product({ name: 'Old SKU', category: 'plumbing' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe('plumbing');
    expect(merged[0].isLegacy).toBe(true);
  });

  it('hides inactive empty categories unless includeInactive', () => {
    const persisted: InventoryCategory[] = [{ id: 'c1', name: 'hidden', isActive: false }];
    expect(mergeCatalogCategories(persisted, [], { includeInactive: false })).toHaveLength(0);
    expect(mergeCatalogCategories(persisted, [], { includeInactive: true })).toHaveLength(1);
  });
});

describe('category image fallback', () => {
  it('prefers category.imageUrl then first product image', () => {
    const products = [
      product({ name: 'A', category: 'tiles', image: '/uploads/a.jpg' }),
      product({ name: 'B', category: 'tiles', image: '/uploads/b.jpg' }),
    ];
    expect(resolveCategoryImageUrl({ imageUrl: '/cat.jpg', name: 'tiles' }, products)).toBe('/cat.jpg');
    expect(resolveCategoryImageUrl({ name: 'tiles' }, products)).toBe('/uploads/a.jpg');
    expect(firstProductImageForCategory(products, 'paint')).toBeUndefined();
  });
});

describe('search / filter / sort', () => {
  const products = [
    product({ name: 'White Tile', category: 'tiles', price: 50, inStock: true, qualityTier: 'high', special: true }),
    product({ name: 'Grey Grout', category: 'tiles', price: 20, inStock: false, qualityTier: 'low' }),
    product({ name: 'Blue Paint', category: 'paint', price: 80, inStock: true, qualityTier: 'medium' }),
  ];

  it('searches case-insensitively by name and category', () => {
    expect(filterAndSortProducts(products, { search: 'TILE' }).map((p) => p.name)).toEqual([
      'Grey Grout',
      'White Tile',
    ]);
    expect(filterAndSortProducts(products, { search: 'paint' }).map((p) => p.name)).toEqual(['Blue Paint']);
  });

  it('filters by category, stock, quality, special and sorts by price', () => {
    const inCat = filterAndSortProducts(products, { category: 'tiles', sort: 'price_asc' });
    expect(inCat.map((p) => p.name)).toEqual(['Grey Grout', 'White Tile']);
    expect(filterAndSortProducts(products, { availability: 'in_stock' })).toHaveLength(2);
    expect(filterAndSortProducts(products, { qualityTier: 'high' }).map((p) => p.name)).toEqual(['White Tile']);
    expect(filterAndSortProducts(products, { special: 'special' }).map((p) => p.name)).toEqual(['White Tile']);
  });

  it('filters category landing by name or matching products', () => {
    const cats = mergeCatalogCategories([{ id: '1', name: 'tiles' }, { id: '2', name: 'paint' }], products);
    expect(filterCatalogCategories(cats, 'pai', products).map((c) => c.key)).toEqual(['paint']);
    expect(filterCatalogCategories(cats, 'grout', products).map((c) => c.key)).toEqual(['tiles']);
  });
});

describe('formatCategoryLabel', () => {
  it('title-cases the first letter', () => {
    expect(formatCategoryLabel('tiles')).toBe('Tiles');
    expect(formatCategoryLabel('')).toBe('General');
  });
});
