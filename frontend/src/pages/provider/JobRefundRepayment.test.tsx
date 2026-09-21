/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProviderJobRefundRepayment from '@/pages/provider/JobRefundRepayment';
import type { ProviderJobRefundObligation } from '@/lib/api/providerAccount';
import type { PaymentIntent } from '@/lib/api/payments';

const getProviderJobRefundObligation = vi.fn();
const createProviderRefundRepaymentCheckout = vi.fn();
const submitProviderRefundRepayment = vi.fn();
const getPaymentProviders = vi.fn();
const getPaymentIntent = vi.fn();
const toast = vi.fn();

vi.mock('@/lib/api/providerAccount', () => ({
  getProviderJobRefundObligation: (...args: unknown[]) => getProviderJobRefundObligation(...args),
  createProviderRefundRepaymentCheckout: (...args: unknown[]) =>
    createProviderRefundRepaymentCheckout(...args),
  submitProviderRefundRepayment: (...args: unknown[]) => submitProviderRefundRepayment(...args),
}));

vi.mock('@/lib/api/payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/payments')>('@/lib/api/payments');
  return {
    ...actual,
    getPaymentProviders: (...args: unknown[]) => getPaymentProviders(...args),
    getPaymentIntent: (...args: unknown[]) => getPaymentIntent(...args),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function obligation(overrides: Partial<ProviderJobRefundObligation> = {}): ProviderJobRefundObligation {
  return {
    jobId: 'job-1',
    jobTitle: 'Deposit repair',
    customerId: 'cust-1',
    customerName: 'Ada Customer',
    amountDue: 232.5,
    dueAt: new Date().toISOString(),
    reference: 'EFX-RR-TEST',
    repaymentStatus: 'REFUND_DUE',
    recoveryStatus: 'PENDING',
    customerRefundPending: 232.5,
    customerRefundImmediate: 0,
    refundStatus: 'partial_pending_recovery',
    customerRefundStatus: null,
    platformBank: {
      bankName: 'Test Bank',
      accountName: 'EloFix',
      accountNumber: '123',
      branchCode: '000',
      accountType: 'CURRENT',
    },
    pendingRepayment: null,
    lastRejectedRepayment: null,
    recoveries: [],
    totalOwed: 232.5,
    ...overrides,
  };
}

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/provider/jobs/job-1/refund${search}`]}>
      <Routes>
        <Route path="/provider/jobs/:id/refund" element={<ProviderJobRefundRepayment />} />
        <Route path="/payments/return" element={<div>Payment return page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('JobRefundRepayment gateway selection + retry CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPaymentProviders.mockResolvedValue(['PAYFAST', 'PAYSTACK']);
    getPaymentIntent.mockRejectedValue(new Error('Payment not found'));
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation(),
    });
    createProviderRefundRepaymentCheckout.mockResolvedValue({
      success: true,
      repaymentId: 'rr-1',
      intentId: 'pi-1',
      amount: 232.5,
      provider: 'PAYSTACK',
      merchantReference: 'EFX-RR-1',
      checkout: { type: 'redirect', url: 'https://checkout.test/paystack', method: 'GET' },
      status: 'SUBMITTED',
    });
  });

  it('renders PayFast and Paystack when two gateways are enabled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PayFast')).toBeInTheDocument();
      expect(screen.getByText('Paystack')).toBeInTheDocument();
    });
  });

  it('sends provider PAYSTACK when Paystack is selected', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText('Paystack')).toBeInTheDocument());
    await user.click(screen.getByText('Paystack'));
    await user.click(screen.getByRole('button', { name: /Pay/i }));
    await waitFor(() => {
      expect(createProviderRefundRepaymentCheckout).toHaveBeenCalledWith('job-1', {
        amount: 232.5,
        provider: 'PAYSTACK',
      });
    });
  });

  it('sends provider PAYFAST when PayFast is selected', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText('PayFast')).toBeInTheDocument());
    await user.click(screen.getByText('PayFast'));
    await user.click(screen.getByRole('button', { name: /Pay/i }));
    await waitFor(() => {
      expect(createProviderRefundRepaymentCheckout).toHaveBeenCalledWith('job-1', {
        amount: 232.5,
        provider: 'PAYFAST',
      });
    });
  });

  it('cannot begin payment without a gateway selection', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Paystack')).toBeInTheDocument());
    const payBtn = screen.getByRole('button', { name: /Pay/i });
    expect(payBtn).toBeDisabled();
    expect(createProviderRefundRepaymentCheckout).not.toHaveBeenCalled();
  });

  it('locks Paystack while an unresolved PayFast attempt is pending', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        pendingRepayment: {
          id: 'rr-1',
          amount: 232.5,
          reference: 'EFX-RR-TEST',
          status: 'SUBMITTED',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
          method: 'GATEWAY',
          gatewayProvider: 'PAYFAST',
          paymentIntentState: 'PENDING',
          gatewayPaymentVerified: false,
        },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/must be completed or resolved before another payment method/i)
      ).toBeInTheDocument();
    });
    const radios = screen.getAllByRole('radio');
    expect(radios.every((el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true')).toBe(
      true
    );
  });

  it('blocks checkout while late PayFast reconciliation is required', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        repaymentStatus: 'PAYMENT_REJECTED',
        pendingRepayment: null,
        lateRepaymentReconciliationRequired: true,
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/PayFast reported a payment after the previous attempt was abandoned/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Pay|Repay|Continue payment/i })).not.toBeInTheDocument();
  });

  it('unlocks PayFast and Paystack after the unresolved repayment is gone', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        repaymentStatus: 'PAYMENT_REJECTED',
        pendingRepayment: null,
        lastRejectedRepayment: {
          amount: 232.5,
          reference: 'EFX-RR-TEST',
          adminNote: 'Checked PayFast dashboard. No successful payment.',
          reviewedAt: new Date().toISOString(),
        },
      }),
    });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText('Paystack')).toBeInTheDocument());
    expect(
      screen.queryByText(/must be completed or resolved before another payment method/i)
    ).not.toBeInTheDocument();
    await user.click(screen.getByText('Paystack'));
    await user.click(screen.getByRole('button', { name: /Pay|Repay/i }));
    await waitFor(() => {
      expect(createProviderRefundRepaymentCheckout).toHaveBeenCalledWith('job-1', {
        amount: 232.5,
        provider: 'PAYSTACK',
      });
    });
  });

  it('still displays Continue payment for unpaid PENDING gateway repayment', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        pendingRepayment: {
          id: 'rr-1',
          amount: 232.5,
          reference: 'EFX-RR-TEST',
          status: 'SUBMITTED',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
          method: 'GATEWAY',
          gatewayProvider: 'PAYFAST',
          paymentIntentState: 'PENDING',
          gatewayPaymentVerified: false,
        },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Continue payment/i })).toBeInTheDocument();
    });
  });

  it('hides repay and shows awaiting verification when gateway intent is PAID', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        repaymentStatus: 'AWAITING_VERIFICATION',
        pendingRepayment: {
          id: 'rr-1',
          amount: 232.5,
          reference: 'EFX-RR-TEST',
          status: 'SUBMITTED',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
          method: 'GATEWAY',
          gatewayProvider: 'PAYSTACK',
          paymentIntentState: 'PAID',
          gatewayPaymentVerified: true,
        },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/awaiting EloFix verification/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /Pay|Continue payment/i })).not.toBeInTheDocument();
  });

  it('retains awaiting verification for submitted bank transfer', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        repaymentStatus: 'AWAITING_VERIFICATION',
        pendingRepayment: {
          id: 'rr-1',
          amount: 232.5,
          reference: 'EFX-RR-TEST',
          status: 'SUBMITTED',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
          method: 'BANK_TRANSFER',
          gatewayPaymentVerified: false,
        },
      }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/awaiting EloFix verification/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /Pay|Continue payment/i })).not.toBeInTheDocument();
  });

  it('refetching after cancel keeps the CTA for an unpaid attempt', async () => {
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation({
        pendingRepayment: {
          id: 'rr-1',
          amount: 232.5,
          reference: 'EFX-RR-TEST',
          status: 'SUBMITTED',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
          method: 'GATEWAY',
          gatewayProvider: 'PAYFAST',
          paymentIntentState: 'PENDING',
          gatewayPaymentVerified: false,
        },
      }),
    });
    renderPage('?cancelled=1');
    await waitFor(() => {
      expect(getProviderJobRefundObligation.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole('button', { name: /Continue payment/i })).toBeInTheDocument();
    });
  });

  it('redirects Paystack return intentId to the payment success screen', async () => {
    renderPage('?intentId=pi-rr-1');
    expect(await screen.findByText('Payment return page')).toBeInTheDocument();
  });

  it('keeps the R232.50 provider-liability amount unchanged', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/232[.,]50/).length).toBeGreaterThan(0);
    });
    expect(getPaymentIntent).not.toHaveBeenCalled();
  });
});

function repaymentIntent(over: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'pi-rr',
    merchantReference: 'EF-RR-RECEIPT-1',
    provider: 'PAYSTACK',
    kind: 'PROVIDER_REFUND_REPAYMENT',
    paymentType: 'PROVIDER_REFUND_REPAYMENT',
    userId: 'provider-1',
    jobId: 'job-1',
    amount: 50,
    currency: 'ZAR',
    state: 'PAID',
    escrowStatus: 'NONE',
    providerPayoutStatus: 'PENDING',
    paidAt: '2026-09-21T07:52:00.000Z',
    ...over,
  };
}

describe('JobRefundRepayment receipt deep-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPaymentProviders.mockResolvedValue(['PAYFAST', 'PAYSTACK']);
    getProviderJobRefundObligation.mockResolvedValue({
      success: true,
      obligation: obligation(),
    });
  });

  it('opens the exact repayment receipt from ?payment=<intentId>', async () => {
    getPaymentIntent.mockResolvedValue(repaymentIntent());
    renderPage('?payment=pi-rr');

    const receipt = await screen.findByRole('region', { name: 'Refund repayment receipt' });
    expect(getPaymentIntent).toHaveBeenCalledWith('pi-rr');
    expect(receipt).toHaveTextContent(/Refund repayment/);
    expect(receipt).toHaveTextContent(/R\s*50,00/);
    expect(receipt).toHaveTextContent('EF-RR-RECEIPT-1');
    expect(receipt).toHaveTextContent(/^[\s\S]*Status[\s\S]*Paid/);
    expect(receipt).toHaveTextContent('Paid');
    expect(receipt).toHaveTextContent('Paystack');
    expect(screen.getByRole('button', { name: /Pay/i })).toBeInTheDocument();
  });

  it('does not render a repayment receipt for the wrong payment kind', async () => {
    getPaymentIntent.mockResolvedValue(
      repaymentIntent({ kind: 'LABOR', paymentType: 'DEPOSIT' })
    );
    renderPage('?payment=pi-labor');

    await waitFor(() => {
      expect(getPaymentIntent).toHaveBeenCalledWith('pi-labor');
    });
    expect(screen.queryByRole('region', { name: 'Refund repayment receipt' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Refund repayment' })).toBeInTheDocument();
  });

  it('does not render a successful receipt while the intent is PROCESSING', async () => {
    getPaymentIntent.mockResolvedValue(repaymentIntent({ state: 'PROCESSING', paidAt: null }));
    renderPage('?payment=pi-rr');

    await waitFor(() => {
      expect(getPaymentIntent).toHaveBeenCalledWith('pi-rr');
    });
    expect(screen.queryByRole('region', { name: 'Refund repayment receipt' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Paid$/)).not.toBeInTheDocument();
  });

  it('does not render a receipt when the intent jobId does not match the page', async () => {
    getPaymentIntent.mockResolvedValue(repaymentIntent({ jobId: 'job-other' }));
    renderPage('?payment=pi-rr');

    await waitFor(() => {
      expect(getPaymentIntent).toHaveBeenCalledWith('pi-rr');
    });
    expect(screen.queryByRole('region', { name: 'Refund repayment receipt' })).not.toBeInTheDocument();
  });

  it('does not show a receipt when the payment cannot be loaded', async () => {
    getPaymentIntent.mockRejectedValue(new Error('Forbidden'));
    renderPage('?payment=pi-missing');

    await waitFor(() => {
      expect(getPaymentIntent).toHaveBeenCalledWith('pi-missing');
    });
    expect(screen.queryByRole('region', { name: 'Refund repayment receipt' })).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Receipt not found', variant: 'destructive' })
    );
  });
});
