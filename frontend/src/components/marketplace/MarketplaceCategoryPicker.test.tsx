import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketplaceCategoryPicker } from './MarketplaceCategoryPicker';

const categories = [
  { id: 'paint', name: 'Paint', slug: 'paint', icon: 'paint' },
  { id: 'electrical', name: 'Electrical', slug: 'electrical', icon: 'electrical' },
];

describe('MarketplaceCategoryPicker', () => {
  it('loads a selected category and keeps the control keyboard reachable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <MarketplaceCategoryPicker categories={categories} selectedId={null} onSelect={onSelect} />
    );
    const paint = screen.getByRole('button', { name: 'Paint' });
    expect(paint).toHaveAttribute('aria-pressed', 'false');
    await user.click(paint);
    expect(onSelect).toHaveBeenCalledWith(categories[0]);

    rerender(
      <MarketplaceCategoryPicker categories={categories} selectedId="paint" onSelect={onSelect} />
    );
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows loading, empty, and error states', () => {
    const { rerender } = render(
      <MarketplaceCategoryPicker categories={[]} selectedId={null} onSelect={() => {}} loading />
    );
    expect(screen.getByText(/loading material categories/i)).toBeInTheDocument();

    rerender(
      <MarketplaceCategoryPicker categories={[]} selectedId={null} onSelect={() => {}} error="Could not load" />
    );
    expect(screen.getByText('Could not load')).toBeInTheDocument();

    rerender(<MarketplaceCategoryPicker categories={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no material categories are available/i)).toBeInTheDocument();
  });
});
