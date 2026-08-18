import type { Supplier, SupplierBranchProfile } from '@/types';
import { resolveUploadUrl } from '@/lib/uploadUrl';

/** Safe public fields only — never phone, address, products, branch counts, or financial data. */
export interface PublicShowcaseSupplier {
  id: string;
  displayName: string;
  initials: string;
  logoUrl?: string;
  /** Short public category/tagline when a real field exists. Never fabricated. */
  tagline?: string;
}

const SKIP_INITIAL_WORDS = new Set(['the', 'and', 'of', 'a', 'an', 'for', 'at', 'in', '&']);

/** Capability-card slot: 220px (mobile) / 240px (sm+) plus mx-3 on each side. */
export function showcaseCardSlotWidth(isSmallUp: boolean): number {
  return (isSmallUp ? 240 : 220) + 24;
}

export function visibleCardCapacity(containerWidth: number, cardSlotWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  if (!Number.isFinite(cardSlotWidth) || cardSlotWidth <= 0) return 1;
  return Math.max(1, Math.floor(containerWidth / cardSlotWidth));
}

export function shouldMarquee(supplierCount: number, visibleCapacity: number): boolean {
  const count = Number.isFinite(supplierCount) ? supplierCount : 0;
  const capacity = Number.isFinite(visibleCapacity) ? Math.max(1, visibleCapacity) : 1;
  return count > capacity;
}

export function supplierDisplayName(
  supplier: Pick<Supplier, 'brandName' | 'businessName' | 'name'>,
): string {
  return firstNonEmpty(supplier.brandName, supplier.businessName, supplier.name);
}

export function supplierInitials(name: string): string {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !SKIP_INITIAL_WORDS.has(word.toLowerCase()));

  if (words.length === 0) return '';
  if (words.length === 1) {
    const letters = words[0].replace(/[^A-Za-z0-9]/g, '');
    return letters.slice(0, 2).toUpperCase() || words[0].slice(0, 2).toUpperCase();
  }

  const first = words[0].replace(/[^A-Za-z0-9]/g, '').charAt(0);
  const second = words[1].replace(/[^A-Za-z0-9]/g, '').charAt(0);
  return `${first}${second}`.toUpperCase();
}

export function showcaseRegion(supplier: Pick<Supplier, 'city' | 'branches'>): string | undefined {
  const orgCity = trimOrUndefined(supplier.city);
  if (orgCity) return orgCity;

  const cities = uniqueCities(supplier.branches);
  return cities.length === 1 ? cities[0] : undefined;
}

/** Only a real public description/category field — never inferred or invented. */
export function showcaseTagline(supplier: Supplier): string | undefined {
  const record = supplier as Supplier & { category?: string | null; tagline?: string | null; description?: string | null };
  return firstNonEmpty(record.tagline, record.category, record.description) || undefined;
}

export function toPublicShowcaseSupplier(supplier: Supplier): PublicShowcaseSupplier | null {
  const branches = Array.isArray(supplier?.branches) ? supplier.branches : [];
  if (branches.length === 0) return null;

  const displayName = supplierDisplayName(supplier);
  if (!displayName) return null;

  const initials = supplierInitials(displayName);
  const logoUrl = resolveUploadUrl(supplier.logo) || undefined;
  const tagline = showcaseTagline(supplier);

  const card: PublicShowcaseSupplier = {
    id: String(supplier.id),
    displayName,
    initials: initials || displayName.slice(0, 2).toUpperCase(),
  };

  if (logoUrl) card.logoUrl = logoUrl;
  if (tagline) card.tagline = tagline;

  return card;
}

export function mapPublicShowcaseSuppliers(suppliers: Supplier[] | null | undefined): PublicShowcaseSupplier[] {
  if (!Array.isArray(suppliers)) return [];
  const seen = new Set<string>();
  const out: PublicShowcaseSupplier[] = [];
  for (const row of suppliers) {
    const mapped = toPublicShowcaseSupplier(row);
    if (!mapped || seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    out.push(mapped);
  }
  return out;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

function uniqueCities(branches: SupplierBranchProfile[] | undefined): string[] {
  if (!Array.isArray(branches)) return [];
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const branch of branches) {
    const city = trimOrUndefined(branch?.city);
    if (!city) continue;
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
  }
  return cities;
}
