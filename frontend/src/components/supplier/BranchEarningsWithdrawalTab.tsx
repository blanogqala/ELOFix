import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getBranchWithdrawalProfile,
  saveBranchWithdrawalProfile,
  requestBranchWithdrawal,
  type BranchBalanceSnapshot,
} from '@/lib/api/supplierPortal';
import { formatCurrency } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Landmark, Loader2 } from 'lucide-react';

type BranchEarningsWithdrawalTabProps = {
  branchId: string;
  balance: BranchBalanceSnapshot | null;
  balanceLoading: boolean;
  onWithdrawalComplete: () => void;
};

export function BranchEarningsWithdrawalTab({
  branchId,
  balance,
  balanceLoading,
  onWithdrawalComplete,
}: BranchEarningsWithdrawalTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [bankMask, setBankMask] = useState<{ account: string; branch: string } | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const available = balance?.available ?? 0;
  const withdrawNum = parseFloat(withdrawAmount);
  const withdrawExceeds = Number.isFinite(withdrawNum) && withdrawNum > available;

  const loadProfile = useCallback(async () => {
    if (!branchId) return;
    setProfileLoading(true);
    try {
      const { profile } = await getBranchWithdrawalProfile(branchId);
      if (profile) {
        setBankName(profile.bankName || '');
        setAccountHolder(profile.accountHolder || '');
        setBankMask({
          account: profile.accountNumberMasked,
          branch: profile.branchCodeMasked,
        });
      } else {
        setBankMask(null);
      }
    } catch {
      toast({ title: 'Could not load bank details', variant: 'destructive' });
    } finally {
      setProfileLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSaveBank = async () => {
    setSavingBank(true);
    try {
      await saveBranchWithdrawalProfile(branchId, {
        bankName,
        accountNumber,
        accountHolder,
        branchCode,
      });
      toast({ title: 'Bank details saved' });
      setAccountNumber('');
      setBranchCode('');
      await loadProfile();
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSavingBank(false);
    }
  };

  const handleWithdraw = async () => {
    const n = parseFloat(withdrawAmount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setWithdrawing(true);
    try {
      await requestBranchWithdrawal(branchId, n);
      toast({ title: 'Withdrawal requested', description: 'Your request is pending processing.' });
      setWithdrawAmount('');
      onWithdrawalComplete();
      await queryClient.invalidateQueries({ queryKey: ['supplier', 'branch-balance', branchId] });
      await queryClient.invalidateQueries({ queryKey: ['supplier', 'branch-withdrawals', branchId] });
    } catch (error) {
      toast({
        title: 'Withdrawal failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="mt-4 space-y-6">
      <div className="card-elevated space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Withdrawal methods</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Bank details are stored encrypted. Available to withdraw:{' '}
          {balanceLoading ? '…' : formatCurrency(available)} (full completed earnings).
        </p>
        {bankMask && (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            On file: account {bankMask.account}, branch {bankMask.branch}. Enter new values below only if you
            want to change them.
          </p>
        )}
        {profileLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="branch-bank-name">Bank name</Label>
              <Input
                id="branch-bank-name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="branch-bank-code">Branch code</Label>
              <Input
                id="branch-bank-code"
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
                className="mt-1"
                autoComplete="off"
                placeholder={bankMask ? 'Leave blank to keep' : 'e.g. 632005'}
              />
            </div>
            <div>
              <Label htmlFor="branch-account">Account number</Label>
              <Input
                id="branch-account"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="mt-1"
                autoComplete="off"
                placeholder={bankMask ? 'Leave blank to keep' : 'Account number'}
              />
            </div>
            <div>
              <Label htmlFor="branch-holder">Account holder</Label>
              <Input
                id="branch-holder"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                className="mt-1"
                autoComplete="name"
              />
            </div>
          </div>
        )}
        <Button type="button" onClick={() => void handleSaveBank()} disabled={savingBank || profileLoading}>
          {savingBank ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save bank details'}
        </Button>
      </div>

      <div className="card-elevated space-y-4 p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Request withdrawal</h2>
        <p className="text-xs text-muted-foreground">
          Total completed earnings: {balanceLoading ? '…' : formatCurrency(balance?.totalEarned ?? 0)} · Already
          withdrawn: {balanceLoading ? '…' : formatCurrency(balance?.totalWithdrawn ?? 0)}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="branch-withdraw-amt">Amount (ZAR)</Label>
            <Input
              id="branch-withdraw-amt"
              type="number"
              min={0}
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleWithdraw()}
            disabled={
              withdrawing ||
              balanceLoading ||
              available <= 0 ||
              withdrawExceeds ||
              !Number.isFinite(withdrawNum) ||
              withdrawNum <= 0
            }
            className="sm:mb-0"
          >
            {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw'}
          </Button>
        </div>
        {withdrawExceeds && (
          <p className="text-xs text-destructive">
            Amount exceeds available balance ({formatCurrency(available)}).
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          You may withdraw any amount up to your branch&apos;s completed earnings, minus prior withdrawals.
        </p>
      </div>
    </div>
  );
}
