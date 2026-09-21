/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PaymentReturn from '@/pages/payments/PaymentReturn';
import type { PaymentIntent } from '@/lib/api/payments';

const confirmPaymentReturn = vi.fn();
const getPaymentIntent = vi.fn();
const payForStoreMaterials = vi.fn();
const getJobById = vi.fn();
const toast = vi.fn();

const authState = { user: { id: 'user-1', role: 'user' as 'user' | 'provider' } };

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
  getJobById: (...args: unknown[]) => getJobById(...args),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

function paidIntent(over: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'pi-1',
    merchantReference: 'EF-XXXXXXXXXXXX',
    provider: 'PAYSTACK',
    kind: 'LABOR',
    paymentType: 'DEPOSIT',
    userId: 'user-1',
    jobId: 'job-1',
    amount: 50,
    currency: 'ZAR',
    state: 'PAID',
    escrowStatus: 'HELD',
    providerPayoutStatus: 'PENDING',
    paidAt: '2026-09-21T07:52:00.000Z',
    ...over,
  };
}

function mockPaid(intent: PaymentIntent) {
  confirmPaymentReturn.mockResolvedValue({
    intent,
    message: 'Payment confirmed',
  });
  getPaymentIntent.mockResolvedValue(intent);
}

function renderReturn(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/payments/return${search}`]}>
      <Routes>
        <Route path="/payments/return" element={<PaymentReturn />} />
        <Route path="/user/jobs/:id" element={<div>Customer job page</div>} />
        <Route path="/user/payments" element={<div>Customer payments page</div>} />
        <Route path="/provider/jobs/:id/refund" element={<div>Provider refund page</div>} />
        <Route path="/provider/jobs/:id" element={<div>Provider job page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PaymentReturn authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user.role = 'user';
    getJobById.mockResolvedValue({ categoryName: 'Plumbing Repair', category: 'Plumbing' });
    payForStoreMaterials.mockResolvedValue({});
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
      paymentType: 'DEPOSIT',
      amount: 50,
    });

    renderReturn('?intentId=pi-1&status=success&trxref=paystack-success');

    await waitFor(() => {
      expect(confirmPaymentReturn).toHaveBeenCalledWith('pi-1');
    });
    expect(screen.queryByRole('heading', { name: /payment successful|deposit payment successful/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Done/i })).not.toBeInTheDocument();
    expect(payForStoreMaterials).not.toHaveBeenCalled();
  });

  it('runs JOB_STORE_ORDER fallback only after authoritative PAID', async () => {
    mockPaid(
      paidIntent({
        id: 'pi-2',
        merchantReference: 'EF-2',
        kind: 'JOB_STORE_ORDER',
        paymentType: 'JOB_STORE_ORDER',
        jobId: 'job-1',
        metadata: { supplierId: 'sup-1', orderId: 'ord-1' },
      })
    );

    renderReturn('?intentId=pi-2');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Materials payment successful/i })).toBeInTheDocument();
    });
    expect(payForStoreMaterials).toHaveBeenCalled();
  });

  it('A. shows deposit payment successful copy', async () => {
    mockPaid(paidIntent({ paymentType: 'DEPOSIT' }));
    renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Deposit payment successful' })).toBeInTheDocument();
    expect(screen.getByText(/Your deposit payment has been completed successfully/i)).toBeInTheDocument();
    expect(screen.getByText('Deposit · 50%')).toBeInTheDocument();
  });

  it('B. shows completion payment successful copy', async () => {
    mockPaid(paidIntent({ paymentType: 'COMPLETION' }));
    renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Completion payment successful' })).toBeInTheDocument();
    expect(screen.getByText('Completion · 50%')).toBeInTheDocument();
  });

  it('C. shows materials payment successful for MATERIAL_ORDER and JOB_STORE_ORDER', async () => {
    mockPaid(paidIntent({ kind: 'MATERIAL_ORDER', paymentType: 'MATERIAL_ORDER' }));
    const first = renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Materials payment successful' })).toBeInTheDocument();
    first.unmount();

    mockPaid(
      paidIntent({
        kind: 'JOB_STORE_ORDER',
        paymentType: 'JOB_STORE_ORDER',
        metadata: { supplierId: 'sup-1' },
      })
    );
    renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Materials payment successful' })).toBeInTheDocument();
  });

  it('D. shows delivery payment successful', async () => {
    mockPaid(paidIntent({ kind: 'DELIVERY_FEE', paymentType: 'DELIVERY_FEE' }));
    renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Delivery payment successful' })).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
  });

  it('E. shows refund repayment successful for PROVIDER_REFUND_REPAYMENT', async () => {
    authState.user.role = 'provider';
    mockPaid(
      paidIntent({
        kind: 'PROVIDER_REFUND_REPAYMENT',
        paymentType: 'PROVIDER_REFUND_REPAYMENT',
      })
    );
    renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Refund repayment successful' })).toBeInTheDocument();
    expect(screen.getByText(/refund repayment to EloFix/i)).toBeInTheDocument();
    expect(screen.queryByText(/Customer refund successful/i)).not.toBeInTheDocument();
  });

  it('F. shows the verified payment amount prominently', async () => {
    mockPaid(paidIntent({ amount: 50 }));
    renderReturn('?intentId=pi-1');
    expect(await screen.findByRole('heading', { name: 'Deposit payment successful' })).toBeInTheDocument();
    expect(screen.getByText(/R\s*50,00/)).toBeInTheDocument();
    expect(screen.getByText('Plumbing Repair')).toBeInTheDocument();
  });

  it('G. Done navigates to the exact related Job Details page', async () => {
    mockPaid(paidIntent({ jobId: 'job-1' }));
    renderReturn('?intentId=pi-1');
    const done = await screen.findByRole('link', { name: /Done/i });
    expect(done).toHaveAttribute('href', '/user/jobs/job-1');
    await userEvent.setup({ pointerEventsCheck: 0 }).click(done);
    expect(await screen.findByText('Customer job page')).toBeInTheDocument();
  });

  it('H. does not render a Dashboard button on success', async () => {
    mockPaid(paidIntent());
    renderReturn('?intentId=pi-1');
    await screen.findByRole('heading', { name: 'Deposit payment successful' });
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Dashboard$/)).not.toBeInTheDocument();
  });

  it('I. View receipt navigates to Payments with the payment intent id', async () => {
    mockPaid(paidIntent({ id: 'pi-1' }));
    renderReturn('?intentId=pi-1');
    const receipt = await screen.findByRole('link', { name: /View receipt/i });
    expect(receipt).toHaveAttribute('href', '/user/payments?payment=pi-1');
    await userEvent.setup({ pointerEventsCheck: 0 }).click(receipt);
    expect(await screen.findByText('Customer payments page')).toBeInTheDocument();
  });

  it('provider refund repayment Done goes to provider Job Details and receipt to the refund page', async () => {
    authState.user.role = 'provider';
    mockPaid(
      paidIntent({
        id: 'pi-rr',
        kind: 'PROVIDER_REFUND_REPAYMENT',
        paymentType: 'PROVIDER_REFUND_REPAYMENT',
        jobId: 'job-9',
      })
    );
    renderReturn('?intentId=pi-rr');
    const done = await screen.findByRole('link', { name: /Done/i });
    expect(done).toHaveAttribute('href', '/provider/jobs/job-9');
    expect(screen.getByRole('link', { name: /View receipt/i })).toHaveAttribute(
      'href',
      '/provider/jobs/job-9/refund?payment=pi-rr'
    );
    await userEvent.setup({ pointerEventsCheck: 0 }).click(done);
    expect(await screen.findByText('Provider job page')).toBeInTheDocument();
  });

  it('K. wraps long references without overflow classes missing', async () => {
    mockPaid(
      paidIntent({
        merchantReference: 'EF-VERYLONGREFERENCEVALUE-THAT-MUST-WRAP-ON-NARROW-SCREENS-1234567890',
      })
    );
    const { container } = renderReturn('?intentId=pi-1');
    await screen.findByRole('heading', { name: 'Deposit payment successful' });
    const ref = container.querySelector('.break-all.font-mono');
    expect(ref).toBeTruthy();
    expect(ref?.textContent).toContain('EF-VERYLONGREFERENCEVALUE');
    expect(container.querySelector('.max-w-\\[520px\\]')).toBeTruthy();
  });
});
