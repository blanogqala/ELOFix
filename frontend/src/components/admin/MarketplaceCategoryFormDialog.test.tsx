import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketplaceCategoryFormDialog } from './MarketplaceCategoryFormDialog';

describe('MarketplaceCategoryFormDialog', () => {
  it('asks only for name, icon, image, and active status', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MarketplaceCategoryFormDialog open mode="create" onOpenChange={() => {}} onSubmit={onSubmit} />
    );

    expect(screen.getByRole('dialog', { name: /new material category/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/category name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/icon \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category image \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^active$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/display order/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/image url/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/category name/i), 'Roofing');
    await user.click(screen.getByRole('button', { name: 'Create category' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'Roofing',
      icon: null,
      imageUrl: null,
      isActive: true,
    }));
  });
});
