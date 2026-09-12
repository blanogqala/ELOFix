/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchBankDetailsTab } from '@/components/supplier/BranchBankDetailsTab';

const getBranchWithdrawalProfile = vi.fn();
const registerBranchWithdrawalProfileGateway = vi.fn();

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/lib/api/supplierPortal', () => ({
  getBranchWithdrawalProfile: (...args: unknown[]) => getBranchWithdrawalProfile(...args),
  registerBranchWithdrawalProfileGateway: (...args: unknown[]) =>
    registerBranchWithdrawalProfileGateway(...args),
  saveBranchWithdrawalProfile: vi.fn(),
  replaceBranchWithdrawalProfile: vi.fn(),
  removeBranchWithdrawalProfile: vi.fn(),
}));

describe('BranchBankDetailsTab connect action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBranchWithdrawalProfile.mockResolvedValue({
      success: true,
      profile: {
        id: 'bprof-1',
        branchId: 'branch-1',
        bankName: 'FNB',
        accountHolder: 'Branch Holder',
        accountNumberMasked: '****3210',
        branchCodeMasked: '6****5',
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
      bankProfileComplete: true,
      canRemove: true,
    });
  });

  it('connects an existing branch profile and shows safe Paystack status', async () => {
    registerBranchWithdrawalProfileGateway.mockResolvedValue({
      success: true,
      profile: {
        id: 'bprof-1',
        branchId: 'branch-1',
        bankName: 'FNB',
        accountHolder: 'Branch Holder',
        accountNumberMasked: '****3210',
        branchCodeMasked: '6****5',
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
      bankProfileComplete: true,
      canRemove: true,
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<BranchBankDetailsTab branchId="branch-1" canEdit />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connect payout destination/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/ACCT_/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Connect payout destination/i }));

    await waitFor(() => {
      expect(registerBranchWithdrawalProfileGateway).toHaveBeenCalledWith('branch-1');
      expect(screen.getByText('Paystack payout destination connected')).toBeInTheDocument();
    });
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
    expect(screen.queryByText(/ACCT_/)).not.toBeInTheDocument();
  });
});
