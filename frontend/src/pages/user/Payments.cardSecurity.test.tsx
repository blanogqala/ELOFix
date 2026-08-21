/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserPayments from '@/pages/user/Payments';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'CUSTOMER', name: 'Test' },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const getSavedCards = vi.fn();
const getInvoices = vi.fn();
const getJobsByUser = vi.fn();

vi.mock('@/lib/api/payments', () => ({
  getSavedCards: (...args: unknown[]) => getSavedCards(...args),
  deleteCard: vi.fn(),
  getInvoices: (...args: unknown[]) => getInvoices(...args),
}));

vi.mock('@/lib/api/jobs', () => ({
  getJobsByUser: (...args: unknown[]) => getJobsByUser(...args),
}));

describe('/user/payments card-data security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSavedCards.mockResolvedValue([]);
    getInvoices.mockResolvedValue([]);
    getJobsByUser.mockResolvedValue([]);
  });

  it('does not render a raw full-card-number or CVV storage form', async () => {
    render(
      <MemoryRouter>
        <UserPayments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Payments/i })).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText('1234 5678 9012 3456')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^CVV$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add New Card/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Saved payment methods will be managed securely through our payment service provider/i)
    ).toBeInTheDocument();
  });
});
