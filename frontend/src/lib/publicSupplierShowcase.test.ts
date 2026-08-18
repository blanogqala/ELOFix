import { describe, expect, it } from 'vitest';
import type { Supplier, SupplierBranchProfile } from '@/types';
import {
  mapPublicShowcaseSuppliers,
  shouldMarquee,
  showcaseCardSlotWidth,
  showcaseRegion,
  supplierDisplayName,
  supplierInitials,
  toPublicShowcaseSupplier,
  visibleCardCapacity,
} from './publicSupplierShowcase';

function branch(partial: Partial<SupplierBranchProfile> = {}): SupplierBranchProfile {
  return {
    id: partial.id ?? 'branch-1',
    supplierId: partial.supplierId ?? 'sup-1',
    name: partial.name ?? 'Main',
    hasDelivery: partial.hasDelivery ?? true,
    products: partial.products ?? [],
    ...partial,
  };
}

function supplier(partial: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup-1',
    name: 'Fallback Name',
    hasDelivery: true,
    products: [],
    branches: [branch()],
    ...partial,
  };
}

describe('supplierDisplayName', () => {
  it('prefers brandName, then businessName, then name', () => {
    expect(
      supplierDisplayName({
        brandName: 'Cape Hardware',
        businessName: 'Cape Hardware Supplies (Pty) Ltd',
        name: 'Internal',
      }),
    ).toBe('Cape Hardware');
    expect(
      supplierDisplayName({
        brandName: '  ',
        businessName: 'Cape Hardware Supplies (Pty) Ltd',
        name: 'Internal',
      }),
    ).toBe('Cape Hardware Supplies (Pty) Ltd');
    expect(supplierDisplayName({ brandName: '', businessName: '', name: 'Internal' })).toBe('Internal');
  });
});

describe('supplierInitials', () => {
  it('uses the first two significant words', () => {
    expect(supplierInitials('Cape Hardware Supplies')).toBe('CH');
  });

  it('skips small words such as The', () => {
    expect(supplierInitials('The Hardware Store')).toBe('HS');
  });

  it('uses the first two letters of a single word', () => {
    expect(supplierInitials('Makro')).toBe('MA');
  });

  it('returns empty for blank input', () => {
    expect(supplierInitials('   ')).toBe('');
  });
});

describe('showcaseRegion', () => {
  it('uses org city when present', () => {
    expect(showcaseRegion({ city: 'Cape Town', branches: [branch({ city: 'Bellville' })] })).toBe('Cape Town');
  });

  it('uses a shared branch city when org city is missing', () => {
    expect(
      showcaseRegion({
        city: '',
        branches: [branch({ city: 'Durban' }), branch({ id: 'b2', city: 'Durban' })],
      }),
    ).toBe('Durban');
  });

  it('omits region when branch cities differ', () => {
    expect(
      showcaseRegion({
        branches: [branch({ city: 'Durban' }), branch({ id: 'b2', city: 'Pretoria' })],
      }),
    ).toBeUndefined();
  });
});

describe('toPublicShowcaseSupplier / mapPublicShowcaseSuppliers', () => {
  it('excludes suppliers with no active branches', () => {
    expect(toPublicShowcaseSupplier(supplier({ branches: [] }))).toBeNull();
    expect(mapPublicShowcaseSuppliers([supplier({ branches: undefined })])).toEqual([]);
  });

  it('maps only safe public fields', () => {
    const mapped = toPublicShowcaseSupplier(
      supplier({
        id: 'sup-9',
        brandName: 'Cape Hardware Supplies',
        logo: '/uploads/suppliers/u1/store-logo/logo.png',
        city: 'Cape Town',
        phone: '021 000 0000',
        address: '1 Secret Road',
        branches: [branch(), branch({ id: 'b2' })],
      }),
    );

    expect(mapped).toEqual({
      id: 'sup-9',
      displayName: 'Cape Hardware Supplies',
      initials: 'CH',
      logoUrl: expect.stringContaining('/uploads/suppliers/u1/store-logo/logo.png'),
    });
    expect(mapped).not.toHaveProperty('branchCount');
    expect(JSON.stringify(mapped)).not.toMatch(/branch/i);
    expect(JSON.stringify(mapped)).not.toContain('021 000 0000');
    expect(JSON.stringify(mapped)).not.toContain('Secret Road');
  });

  it('omits logo, tagline, and branch counts', () => {
    const mapped = toPublicShowcaseSupplier(
      supplier({
        name: 'Solo Store',
        brandName: undefined,
        businessName: undefined,
        logo: undefined,
        city: undefined,
        branches: [branch({ city: undefined })],
      }),
    );

    expect(mapped?.displayName).toBe('Solo Store');
    expect(mapped?.initials).toBe('SS');
    expect(mapped?.logoUrl).toBeUndefined();
    expect(mapped?.tagline).toBeUndefined();
    expect(mapped).not.toHaveProperty('branchCount');
    expect(mapped).not.toHaveProperty('description');
  });

  it('does not invent a tagline from city or branch data', () => {
    const mapped = toPublicShowcaseSupplier(
      supplier({
        brandName: 'Cape Hardware Supplies',
        city: 'Cape Town',
        branches: [branch(), branch({ id: 'b2' })],
      }),
    );

    expect(mapped?.tagline).toBeUndefined();
    expect(mapped).not.toHaveProperty('branchCount');
  });

  it('uses a real tagline only when the public payload includes one', () => {
    const mapped = toPublicShowcaseSupplier({
      ...supplier({ brandName: 'Cape Hardware Supplies' }),
      tagline: 'Paint & hardware',
    } as Supplier);

    expect(mapped?.tagline).toBe('Paint & hardware');
  });

  it('returns an empty list for null input', () => {
    expect(mapPublicShowcaseSuppliers(null)).toEqual([]);
    expect(mapPublicShowcaseSuppliers(undefined)).toEqual([]);
  });
});

describe('visible capacity and marquee decision', () => {
  it('keeps at least one card of capacity', () => {
    expect(visibleCardCapacity(0, 264)).toBe(1);
    expect(visibleCardCapacity(-10, 264)).toBe(1);
  });

  it('adapts to container width', () => {
    const mobileSlot = showcaseCardSlotWidth(false);
    const desktopSlot = showcaseCardSlotWidth(true);
    expect(visibleCardCapacity(360, mobileSlot)).toBe(1);
    expect(visibleCardCapacity(700, mobileSlot)).toBe(Math.floor(700 / mobileSlot));
    expect(visibleCardCapacity(1200, desktopSlot)).toBe(Math.floor(1200 / desktopSlot));
  });

  it('stays static when count is within capacity, including 0–3 and exact fill', () => {
    expect(shouldMarquee(0, 3)).toBe(false);
    expect(shouldMarquee(1, 3)).toBe(false);
    expect(shouldMarquee(2, 3)).toBe(false);
    expect(shouldMarquee(3, 3)).toBe(false);
    expect(shouldMarquee(4, 4)).toBe(false);
  });

  it('enables marquee only when count exceeds capacity', () => {
    expect(shouldMarquee(2, 1)).toBe(true);
    expect(shouldMarquee(4, 3)).toBe(true);
    expect(shouldMarquee(8, 3)).toBe(true);
  });
});
