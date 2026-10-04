import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketplaceCategoryPicker } from './MarketplaceCategoryPicker';
import { ALL_MATERIALS_DISCOVERY } from '@/lib/marketplace/allMaterialsDiscovery';

const categories = [
  { id: 'paint', name: 'Paint', slug: 'paint', icon: 'paint' },
  { id: 'electrical', name: 'Electrical', slug: 'electrical', icon: 'electrical' },
];

describe('MarketplaceCategoryPicker', () => {
  it('puts virtual All Materials first and keeps real categories selectable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <MarketplaceCategoryPicker categories={categories} selectedId={null} onSelect={onSelect} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['All Materials', 'Paint', 'Electrical']);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'All Materials' }));
    expect(onSelect).toHaveBeenCalledWith(ALL_MATERIALS_DISCOVERY);

    await user.click(screen.getByRole('button', { name: 'Paint' }));
    expect(onSelect).toHaveBeenCalledWith({ categoryId: 'paint', name: 'Paint' });

    rerender(
      <MarketplaceCategoryPicker categories={categories} selectedId="all" onSelect={onSelect} />
    );
    expect(screen.getByRole('button', { name: 'All Materials' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <MarketplaceCategoryPicker categories={categories} selectedId="paint" onSelect={onSelect} />
    );
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows All Materials while categories load as empty, and keeps it available on error', () => {
    const { rerender } = render(
      <MarketplaceCategoryPicker categories={[]} selectedId={null} onSelect={() => {}} loading />
    );
    expect(screen.getByText(/loading material categories/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All Materials' })).not.toBeInTheDocument();

    rerender(
      <MarketplaceCategoryPicker categories={[]} selectedId={null} onSelect={() => {}} error="Could not load" />
    );
    expect(screen.getByRole('button', { name: 'All Materials' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paint' })).not.toBeInTheDocument();
    expect(screen.getByText('Could not load')).toBeInTheDocument();

    rerender(<MarketplaceCategoryPicker categories={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'All Materials' })).toBeInTheDocument();
    expect(screen.queryByText(/no material categories are available/i)).not.toBeInTheDocument();
  });
});
