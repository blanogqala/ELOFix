import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MarketplaceCategoryIcon, normalizeMarketplaceIconKey } from './marketplaceCategoryIcons';
import { isKnownMarketplaceIcon, searchMarketplaceIcons } from './marketplaceIconCatalog';

describe('marketplace category icons', () => {
  it('normalizes typed names to the stored key', () => {
    expect(normalizeMarketplaceIconKey(' Warehouse ')).toBe('warehouse');
    expect(normalizeMarketplaceIconKey('not valid!!!')).toBe('not-valid');
    expect(normalizeMarketplaceIconKey('@@@')).toBeNull();
  });

  it('searches suggestions and bundled lucide names', () => {
    expect(searchMarketplaceIcons('').map((option) => option.value)).toContain('roofing');
    expect(searchMarketplaceIcons('warehouse').some((option) => option.value === 'warehouse')).toBe(true);
    expect(searchMarketplaceIcons('hammer').some((option) => option.value === 'hammer')).toBe(true);
    expect(isKnownMarketplaceIcon('paint')).toBe(true);
    expect(isKnownMarketplaceIcon('warehouse')).toBe(true);
    expect(isKnownMarketplaceIcon('not-a-real-icon-xyz')).toBe(false);
  });

  it('renders an alias and falls back for an unknown name', () => {
    const alias = render(<MarketplaceCategoryIcon icon="paint" />);
    expect(alias.container.querySelector('svg')).toBeTruthy();
    expect(alias.container.querySelector('.lucide-hammer')).toBeNull();

    const unknown = render(<MarketplaceCategoryIcon icon="not-a-real-icon-xyz" />);
    expect(unknown.container.querySelector('.lucide-hammer')).toBeTruthy();
  });
});
