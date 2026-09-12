/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PaymentReturn from '@/pages/payments/PaymentReturn';

const confirmPaymentReturn = vi.fn();
const getPaymentIntent = vi.fn();
const payForStoreMaterials = vi.fn();

vi.mock('@/lib/api/payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/payments')>('@/lib/api/payments');
  return {
    ...actual,
    confirmPaymentReturn: (...args: unknown[]) => confirmPaymentReturn(...args),
    getPaymentIntent: (...args: unknown[]) => getPaymentIntent(...args),
  };
});

vi.mock('@/lib/api/jobs', () => ({
  payForStoreMaterials: (...args: unknown[]) => payForStoreMaterials(...args),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderReturn(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/payments/return${search}`]}>
      <Routes>
        <Route path="/payments/return" element={<PaymentReturn />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PaymentReturn authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not claim success while PaymentIntent is PROCESSING', async () => {
    confirmPaymentReturn.mockResolvedValue({
      intent: { id: 'pi-1', state: 'PROCESSING', merchantReference: 'EF-1' },
      message: 'Payment processing — you will be notified when confirmed',
    });
    getPaymentIntent.mockResolvedValue({
      id: 'pi-1',
      state: 'PROCESSING',
      merchantReference: 'EF-1',
      provider: 'PAYSTACK',
      kind: 'LABOR',
    });

    renderReturn('?intentId=pi-1&status=success&trxref=paystack-success');

    await waitFor(() => {
      expect(confirmPaymentReturn).toHaveBeenCalledWith('pi-1');
    });
    expect(screen.queryByText(/Payment confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/successful/i)).not.toBeInTheDocument();
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
    expect(payForStoreMaterials).not.toHaveBeenCalled();
  });

  it('runs JOB_STORE_ORDER fallback only after authoritative PAID', async () => {
    confirmPaymentReturn.mockResolvedValue({
      intent: { id: 'pi-2', state: 'PAID', merchantReference: 'EF-2' },
      message: 'Payment confirmed',
    });
    getPaymentIntent.mockResolvedValue({
      id: 'pi-2',
      state: 'PAID',
      merchantReference: 'EF-2',
      provider: 'PAYSTACK',
      kind: 'JOB_STORE_ORDER',
      jobId: 'job-1',
      metadata: { supplierId: 'sup-1', orderId: 'ord-1' },
    });
    payForStoreMaterials.mockResolvedValue({});

    renderReturn('?intentId=pi-2');

    await waitFor(() => {
      expect(screen.getByText(/Payment confirmed/i)).toBeInTheDocument();
    });
    expect(payForStoreMaterials).toHaveBeenCalled();
  });
});
