import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CatalogToolbar } from './CatalogToolbar';
import type { CatalogProductFilters } from './catalogUtils';

const filters: CatalogProductFilters = {
  search: '',
  category: 'all',
  availability: 'all',
  qualityTier: 'all',
  special: 'all',
  sort: 'name_asc',
};

describe('CatalogToolbar modes', () => {
  it('category mode shows search and omits product-only filters', () => {
    render(
      <CatalogToolbar
        mode="categories"
        filters={filters}
        onChange={() => undefined}
        categoryKeys={['tiles', 'paint']}
        searchPlaceholder="Search categories"
      />
    );
    expect(screen.getByLabelText('Search catalogue')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by category')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by availability')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by quality')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter specials')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sort catalogue')).not.toBeInTheDocument();
  });

  it('category mode can opt in to a category selector', () => {
    render(
      <CatalogToolbar
        mode="categories"
        showCategory
        filters={filters}
        onChange={() => undefined}
        categoryKeys={['tiles']}
      />
    );
    expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sort catalogue')).not.toBeInTheDocument();
  });

  it('product mode shows availability, quality, specials, and sort', () => {
    render(
      <CatalogToolbar
        mode="products"
        filters={filters}
        onChange={() => undefined}
        hideCategory
      />
    );
    expect(screen.getByLabelText('Search catalogue')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by category')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filter by availability')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by quality')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter specials')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort catalogue')).toBeInTheDocument();
  });
});
