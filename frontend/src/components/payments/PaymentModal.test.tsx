import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

const createPaymentIntent = vi.fn();
const getPaymentProviders = vi.fn();
const submitCheckout = vi.fn();

vi.mock('@/lib/api/payments', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/payments')>('@/lib/api/payments');
  return {
    ...actual,
    createPaymentIntent: (...args: unknown[]) => createPaymentIntent(...args),
    getPaymentProviders: (...args: unknown[]) => getPaymentProviders(...args),
  };
});

vi.mock('@/lib/paymentCheckout', () => ({
  submitCheckout: (...args: unknown[]) => submitCheckout(...args),
}));

const authUser = { id: 'user-1', role: 'CUSTOMER', name: 'Test User' };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authUser,
  }),
}));

vi.mock('@/components/common/loading', () => ({
  LoadingOverlay: () => null,
}));

function renderModal(
  props: Partial<ComponentProps<typeof PaymentModal>> & { open?: boolean } = {}
) {
  const onOpenChange = vi.fn();
  const result = render(
    <MemoryRouter>
      <PaymentModal
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        title="Pay Service / Labor"
        amount={500}
        kind={props.kind ?? 'LABOR'}
        jobId="job-1"
        breakdown={[
          { label: 'Service', amount: 500 },
          { label: 'Total Due', amount: 500, isBold: true },
        ]}
        {...props}
      />
    </MemoryRouter>
  );
  return { ...result, onOpenChange };
}

describe('PaymentModal hosted checkout (no EloFix card/CVC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPaymentProviders.mockResolvedValue(['PAYFAST']);
    createPaymentIntent.mockResolvedValue({
      intentId: 'pi-1',
      merchantReference: 'EF-TEST',
      intent: { id: 'pi-1' },
      checkout: { type: 'redirect', url: 'https://example.com/pay' },
    });
  });

  function setupUser() {
    return userEvent.setup({ pointerEventsCheck: 0 });
  }

  it('does not request CVC or card number', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay/i })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/CVC|CVV|Security Code/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/1234 5678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
  });

  it('opens with legal checkbox unchecked and Pay disabled even with provider', async () => {
    setupUser();
    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    const payBtn = screen.getByRole('button', { name: /Pay/i });
    expect(payBtn).toBeDisabled();
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it('enables Pay after checking policy and proceeds without card/CVC fields', async () => {
    const user = setupUser();
    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

    const payBtn = screen.getByRole('button', { name: /Pay/i });
    await waitFor(() => expect(payBtn).not.toBeDisabled());

    await user.click(payBtn);

    await waitFor(() => {
      expect(createPaymentIntent).toHaveBeenCalledTimes(1);
    });
    const arg = createPaymentIntent.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.legalAcceptance).toEqual({
      refundPolicyAccepted: true,
      refundPolicyVersion: LEGAL_VERSIONS.refundPolicy,
      deliveryPolicyAcknowledged: false,
      deliveryPolicyVersion: null,
    });
    expect(arg).not.toHaveProperty('cvv');
    expect(arg).not.toHaveProperty('cvc');
    expect(arg).not.toHaveProperty('cardId');
    expect(arg).not.toHaveProperty('cardNumber');
    expect(submitCheckout).toHaveBeenCalled();
  });

  it('links refund policy to /refund-policy', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Refund, Returns & Cancellation Policy/i })).toHaveAttribute(
        'href',
        '/refund-policy'
      );
    });
  });

  it('material checkout also exposes delivery policy link', async () => {
    renderModal({
      kind: 'MATERIAL_ORDER',
      title: 'Pay for materials',
      materialOrderId: 'mo-1',
      jobId: undefined,
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Refund, Returns & Cancellation Policy/i })).toHaveAttribute(
        'href',
        '/refund-policy'
      );
      expect(screen.getByRole('link', { name: /Delivery & Collection Policy/i })).toHaveAttribute(
        'href',
        '/delivery-policy'
      );
    });
  });

  it('resets acceptance when modal closes and reopens', async () => {
    const user = setupUser();
    const { rerender, onOpenChange } = renderModal({ open: true });

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument());

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

    rerender(
      <MemoryRouter>
        <PaymentModal
          open={false}
          onOpenChange={onOpenChange}
          title="Pay Service / Labor"
          amount={500}
          kind="LABOR"
          jobId="job-1"
          breakdown={[{ label: 'Total', amount: 500, isBold: true }]}
        />
      </MemoryRouter>
    );

    rerender(
      <MemoryRouter>
        <PaymentModal
          open={true}
          onOpenChange={onOpenChange}
          title="Pay Service / Labor"
          amount={500}
          kind="LABOR"
          jobId="job-1"
          breakdown={[{ label: 'Total', amount: 500, isBold: true }]}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('does not pre-accept a completion modal after a deposit acceptance in a prior open', async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <MemoryRouter>
        <PaymentModal
          open
          onOpenChange={onOpenChange}
          title="Deposit"
          amount={500}
          kind="LABOR"
          jobId="job-1"
          paymentType="DEPOSIT"
          breakdown={[{ label: 'Deposit', amount: 500, isBold: true }]}
        />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

    rerender(
      <MemoryRouter>
        <PaymentModal
          open={false}
          onOpenChange={onOpenChange}
          title="Deposit"
          amount={500}
          kind="LABOR"
          jobId="job-1"
          paymentType="DEPOSIT"
          breakdown={[{ label: 'Deposit', amount: 500, isBold: true }]}
        />
      </MemoryRouter>
    );

    rerender(
      <MemoryRouter>
        <PaymentModal
          open
          onOpenChange={onOpenChange}
          title="Completion"
          amount={500}
          kind="LABOR"
          jobId="job-1"
          paymentType="COMPLETION"
          breakdown={[{ label: 'Completion', amount: 500, isBold: true }]}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Completion/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('keeps legal acknowledgement readable with wrap-safe classes', async () => {
    renderModal({ kind: 'MATERIAL_ORDER', materialOrderId: 'mo-1', jobId: undefined });
    await waitFor(() => {
      const label = screen.getByText(/acknowledge the/i);
      expect(label.className).toMatch(/break-words/);
      expect(label.className).toMatch(/min-w-0/);
    });
  });

  it('shows amount summary and ZAR before redirect', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Total Due')).toBeInTheDocument();
      expect(screen.getByText('ZAR')).toBeInTheDocument();
    });
  });
});
