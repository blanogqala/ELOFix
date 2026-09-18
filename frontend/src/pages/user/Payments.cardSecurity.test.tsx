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

const getInvoices = vi.fn();
const getJobsByUser = vi.fn();

vi.mock('@/lib/api/payments', () => ({
  getInvoices: (...args: unknown[]) => getInvoices(...args),
}));

vi.mock('@/lib/api/jobs', () => ({
  getJobsByUser: (...args: unknown[]) => getJobsByUser(...args),
}));

describe('/user/payments card-data security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(screen.getByRole('heading', { name: /^Payments$/i })).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText('1234 5678 9012 3456')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^CVV$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add New Card/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save card/i })).not.toBeInTheDocument();
  });
});
