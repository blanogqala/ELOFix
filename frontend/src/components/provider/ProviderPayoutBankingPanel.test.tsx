/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProviderPayoutBankingPanel } from '@/components/provider/ProviderPayoutBankingPanel';

const getWithdrawalProfile = vi.fn();
const registerWithdrawalProfileGateway = vi.fn();

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/lib/api/providerAccount', () => ({
  getWithdrawalProfile: (...args: unknown[]) => getWithdrawalProfile(...args),
  registerWithdrawalProfileGateway: (...args: unknown[]) => registerWithdrawalProfileGateway(...args),
  saveWithdrawalProfile: vi.fn(),
  replaceWithdrawalProfile: vi.fn(),
  removeWithdrawalProfile: vi.fn(),
}));

function renderPanel() {
  return render(
    <MemoryRouter>
      <ProviderPayoutBankingPanel />
    </MemoryRouter>
  );
}

describe('ProviderPayoutBankingPanel connect action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWithdrawalProfile.mockResolvedValue({
      success: true,
      profile: {
        id: 'prof-1',
        providerId: 'prov-1',
        bankName: 'FNB',
        accountHolder: 'Ada',
        accountNumberMasked: '****7890',
        branchCodeMasked: '2****5',
        accountType: 'CHEQUE',
        gatewaySettlementProfile: {
          provider: null,
          recipientConfigured: false,
          status: 'PENDING',
        },
        updatedAt: new Date().toISOString(),
      },
      verificationStatus: 'PENDING_VERIFICATION',
      gatewaySettlementSupported: true,
      canRemove: true,
    });
  });

  it('connects an existing bank profile and shows safe Paystack status', async () => {
    registerWithdrawalProfileGateway.mockResolvedValue({
      success: true,
      profile: {
        id: 'prof-1',
        providerId: 'prov-1',
        bankName: 'FNB',
        accountHolder: 'Ada',
        accountNumberMasked: '****7890',
        branchCodeMasked: '2****5',
        accountType: 'CHEQUE',
        gatewaySettlementProfile: {
          provider: 'PAYSTACK',
          recipientConfigured: true,
          status: 'PENDING',
        },
        updatedAt: new Date().toISOString(),
      },
      verificationStatus: 'PENDING_VERIFICATION',
      gatewaySettlementSupported: true,
      canRemove: true,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connect payout destination/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
    expect(screen.queryByText(/ACCT_/)).not.toBeInTheDocument();
    expect(screen.queryByText('1234567890')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Connect payout destination/i }));

    await waitFor(() => {
      expect(registerWithdrawalProfileGateway).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Paystack payout destination connected')).toBeInTheDocument();
    });
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
    expect(screen.queryByText(/ACCT_/)).not.toBeInTheDocument();
  });
});
