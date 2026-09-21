import type { InventoryCategory } from '@/types';

export function canonicalInventoryCategory(cat: string | undefined | null): string {
  const s = String(cat ?? '')
    .trim()
    .toLowerCase();
  return s.length ? s : 'general';
}

export function formatCategoryLabel(cat: string | undefined | null): string {
  const t = String(cat ?? '')
    .trim()
    .replace(/_/g, ' ');
  if (!t) return 'General';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type CatalogProductLike = {
  id: string;
  name: string;
  category?: string;
  price: number;
  unit?: string;
  inStock?: boolean;
  quantity?: number;
  qualityTier?: string;
  special?: boolean;
  description?: string;
  image?: string;
};

export interface CatalogCategoryView {
  key: string;
  id?: string;
  name: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  inStockCount: number;
  isLegacy: boolean;
}

export type CatalogAvailabilityFilter = 'all' | 'in_stock' | 'out_of_stock';
export type CatalogSort = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';
export type CatalogQualityFilter = 'all' | 'low' | 'medium' | 'high';
export type CatalogSpecialFilter = 'all' | 'special' | 'regular';

export interface CatalogProductFilters {
  search?: string;
  category?: string;
  availability?: CatalogAvailabilityFilter;
  qualityTier?: CatalogQualityFilter;
  special?: CatalogSpecialFilter;
  sort?: CatalogSort;
  priceMin?: number;
  priceMax?: number;
}

export function firstProductImageForCategory(
  products: Array<{ category?: string; image?: string }>,
  categoryKey: string
): string | undefined {
  const key = canonicalInventoryCategory(categoryKey);
  for (const p of products) {
    if (canonicalInventoryCategory(p.category) !== key) continue;
    const img = String(p.image || '').trim();
    if (img) return img;
  }
  return undefined;
}

export function resolveCategoryImageUrl(
  category: { imageUrl?: string | null; name?: string; key?: string },
  products: Array<{ category?: string; image?: string }>
): string | undefined {
  const fromCat = String(category.imageUrl || '').trim();
  if (fromCat) return fromCat;
  return firstProductImageForCategory(products, category.key || category.name || '');
}

/**
 * Merge persisted BranchInventoryCategory rows with product-derived category keys.
 * Empty persisted categories are kept. Legacy product categories are added if missing.
 */
export function mergeCatalogCategories(
  persisted: InventoryCategory[] | undefined | null,
  products: Array<{ category?: string; inStock?: boolean }>,
  options?: { includeInactive?: boolean }
): CatalogCategoryView[] {
  const includeInactive = options?.includeInactive !== false;
  const byKey = new Map<string, CatalogCategoryView>();

  for (const row of persisted ?? []) {
    if (!row || typeof row !== 'object') continue;
    const key = canonicalInventoryCategory(row.name);
    if (!includeInactive && row.isActive === false) continue;
    byKey.set(key, {
      key,
      id: row.id,
      name: key,
      imageUrl: row.imageUrl && String(row.imageUrl).trim() ? String(row.imageUrl).trim() : undefined,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
      isActive: row.isActive !== false,
      productCount: 0,
      inStockCount: 0,
      isLegacy: false,
    });
  }

  for (const p of products) {
    const key = canonicalInventoryCategory(p.category);
    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        name: key,
        sortOrder: 0,
        isActive: true,
        productCount: 0,
        inStockCount: 0,
        isLegacy: true,
      };
      byKey.set(key, row);
    }
    row.productCount += 1;
    if (p.inStock !== false) row.inStockCount += 1;
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

export function filterCatalogCategories(
  categories: CatalogCategoryView[],
  searchRaw: string,
  products?: Array<{ name?: string; category?: string; description?: string }>
): CatalogCategoryView[] {
  const q = searchRaw.trim().toLowerCase();
  if (!q) return categories;
  return categories.filter((cat) => {
    if (formatCategoryLabel(cat.name).toLowerCase().includes(q) || cat.name.toLowerCase().includes(q)) {
      return true;
    }
    if (!products) return false;
    return products.some((p) => {
      if (canonicalInventoryCategory(p.category) !== cat.key) return false;
      const hay = `${p.name ?? ''} ${p.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  });
}

export function prioritizeCategoryKey(
  categories: CatalogCategoryView[],
  preferredKey: string | undefined | null
): CatalogCategoryView[] {
  const want = canonicalInventoryCategory(preferredKey);
  if (!preferredKey || !want) return categories;
  const match = categories.filter((c) => c.key === want);
  const rest = categories.filter((c) => c.key !== want);
  return [...match, ...rest];
}

export function filterAndSortProducts<T extends CatalogProductLike>(
  products: T[],
  filters: CatalogProductFilters = {}
): T[] {
  const q = (filters.search ?? '').trim().toLowerCase();
  const cat = filters.category && filters.category !== 'all' ? canonicalInventoryCategory(filters.category) : '';
  const availability = filters.availability ?? 'all';
  const quality = filters.qualityTier ?? 'all';
  const special = filters.special ?? 'all';
  const priceMin = Number.isFinite(Number(filters.priceMin)) ? Number(filters.priceMin) : undefined;
  const priceMax = Number.isFinite(Number(filters.priceMax)) ? Number(filters.priceMax) : undefined;

  let list = products.filter((p) => {
    const pCat = canonicalInventoryCategory(p.category);
    if (cat && pCat !== cat) return false;
    if (availability === 'in_stock' && p.inStock === false) return false;
    if (availability === 'out_of_stock' && p.inStock !== false) return false;
    if (quality !== 'all' && String(p.qualityTier || '') !== quality) return false;
    if (special === 'special' && !p.special) return false;
    if (special === 'regular' && p.special) return false;
    const price = Number(p.price);
    if (priceMin != null && Number.isFinite(price) && price < priceMin) return false;
    if (priceMax != null && Number.isFinite(price) && price > priceMax) return false;
    if (!q) return true;
    const hay = `${p.name ?? ''} ${pCat} ${p.description ?? ''}`.toLowerCase();
    return hay.includes(q);
  });

  const sort = filters.sort ?? 'name_asc';
  list = [...list].sort((a, b) => {
    if (sort === 'price_asc') return Number(a.price) - Number(b.price);
    if (sort === 'price_desc') return Number(b.price) - Number(a.price);
    if (sort === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''));
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  return list;
}
