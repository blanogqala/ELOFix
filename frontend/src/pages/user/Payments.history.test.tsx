/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserPayments from '@/pages/user/Payments';
import type { Invoice } from '@/types';

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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));


const getInvoices = vi.fn();
const getJobsByUser = vi.fn();

vi.mock('@/lib/api/payments', () => ({
  getInvoices: (...args: unknown[]) => getInvoices(...args),
}));

vi.mock('@/lib/api/jobs', () => ({
  getJobsByUser: (...args: unknown[]) => getJobsByUser(...args),
}));

function invoice(over: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    jobId: 'job-1',
    userId: 'user-1',
    type: 'labor',
    status: 'paid',
    totalAmount: 50,
    lineItems: [{ description: 'Labor / Service', quantity: 1, unitPrice: 50, total: 50 }],
    paymentMethod: 'Card',
    cardLast4: '4242',
    paidAt: '2026-09-14T10:00:00.000Z',
    createdAt: '2026-09-14T10:00:00.000Z',
    ...over,
  };
}

describe.sequential('/user/payments history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobsByUser.mockResolvedValue([{ id: 'job-1', categoryName: 'Tiling' }]);
    getInvoices.mockResolvedValue([
      invoice({ id: 'pay-1', type: 'labor', paymentType: 'DEPOSIT' }),
      invoice({ id: 'ref-1', type: 'refund', status: 'refunded', totalAmount: 25 }),
    ]);
  });

  it('does not render saved-card charging UI and uses a two-column tab grid', async () => {
    const { container } = render(
      <MemoryRouter>
        <UserPayments />
      </MemoryRouter>
    );

    expect(await screen.findByText(/View your payments, invoices and refunds/i)).toBeInTheDocument();

    expect(screen.queryByPlaceholderText('1234 5678 9012 3456')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^CVV$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add New Card/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Payment methods')).not.toBeInTheDocument();

    const tablist = screen.getByRole('tablist');
    expect(tablist.className).toContain('grid-cols-2');
    expect(tablist.className).not.toContain('flex-wrap');
    expect(container.querySelector('.flex-wrap.gap-2.border-b')).toBeNull();

    expect(screen.getByRole('tab', { name: /Payments/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Refund/i })).toBeInTheDocument();
    expect(screen.getByText('Service deposit')).toBeInTheDocument();
    expect(screen.queryByText(/Refund · Tiling/i)).not.toBeInTheDocument();
  });

  it('Refund Invoices tab shows refunds only and invoice dialog retains details/download', async () => {
    render(
      <MemoryRouter>
        <UserPayments />
      </MemoryRouter>
    );

    expect(await screen.findByText('Service deposit')).toBeInTheDocument();
    screen.getByRole('tab', { name: /Refund/i }).click();
    expect(await screen.findByText(/Refund · Tiling/i)).toBeInTheDocument();
    expect(screen.queryByText('Service deposit')).not.toBeInTheDocument();

    screen.getByRole('button', { name: /View invoice/i }).click();
    expect(await screen.findByText('Invoice Details')).toBeInTheDocument();
    expect(screen.getByText('ref-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Invoice/i })).toBeInTheDocument();
  });
});
