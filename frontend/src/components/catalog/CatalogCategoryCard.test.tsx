import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogBreadcrumbs } from './CatalogBreadcrumbs';
import { CatalogCategoryCard } from './CatalogCategoryCard';
import { CatalogProductCard } from './CatalogProductCard';

describe('catalogue navigation primitives', () => {
  it('clicking a category card selects that category', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CatalogCategoryCard name="tiles" productCount={28} onSelect={onSelect} />
    );
    await user.click(screen.getByRole('button', { name: /tiles, 28 products/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Back to categories fires onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <CatalogBreadcrumbs items={[{ label: 'Tiles' }]} onBack={onBack} />
    );
    await user.click(screen.getByRole('button', { name: /back to categories/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('product card action slot keeps add/quantity controls usable', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <CatalogProductCard
        product={{ id: 'p1', name: 'White Tile', category: 'tiles', price: 50, unit: 'box' }}
        actions={
          <button type="button" onClick={onAdd}>
            Add
          </button>
        }
      />
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByText('White Tile')).toBeInTheDocument();
  });
});
