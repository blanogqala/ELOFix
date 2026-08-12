import { useCallback, useEffect, useState } from 'react';
import {
  getBranchWithdrawalProfile,
  removeBranchWithdrawalProfile,
  replaceBranchWithdrawalProfile,
  saveBranchWithdrawalProfile,
  type BranchSettlementSummary,
} from '@/lib/api/supplierPortal';
import {
  gatewaySettlementLabel,
  payoutStatusBadgeClass,
  payoutVerificationLabel,
  postSaveVerificationMessage,
  removeBlockedMessage,
  type PayoutVerificationStatus,
} from '@/lib/payoutBankingDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Landmark, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type BranchBankDetailsTabProps = {
  branchId: string;
  canEdit: boolean;
  settlementSummary?: BranchSettlementSummary | null;
  onSaved?: () => void;
};

type AccountType = 'CHEQUE' | 'SAVINGS' | 'CURRENT';
type PanelMode = 'view' | 'edit' | 'replace' | 'create';

export function BranchBankDetailsTab({
  branchId,
  canEdit,
  settlementSummary,
  onSaved,
}: BranchBankDetailsTabProps) {
  const { toast } = useToast();

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountType, setAccountType] = useState<AccountType | ''>('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [mode, setMode] = useState<PanelMode>('create');
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<PayoutVerificationStatus>('NOT_CONFIGURED');
  const [gatewaySettlementSupported, setGatewaySettlementSupported] = useState(false);
  const [canRemove, setCanRemove] = useState(false);
  const [removeBlockedReason, setRemoveBlockedReason] = useState<string | undefined>();
  const [profileMask, setProfileMask] = useState<{ account: string; branch: string } | null>(null);
  const [gatewayProfile, setGatewayProfile] = useState<{
    status?: string | null;
    provider?: string | null;
    recipientConfigured?: boolean;
  } | null>(null);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);

  const applyResponse = useCallback((data: Awaited<ReturnType<typeof getBranchWithdrawalProfile>>) => {
    setVerificationStatus((data.verificationStatus as PayoutVerificationStatus) || 'NOT_CONFIGURED');
    setGatewaySettlementSupported(Boolean(data.gatewaySettlementSupported));
    setCanRemove(Boolean(data.canRemove));
    setRemoveBlockedReason(data.removeBlockedReason);
    setGatewayProfile(data.profile?.gatewaySettlementProfile || null);
    if (data.profile) {
      setBankName(data.profile.bankName || '');
      setAccountHolder(data.profile.accountHolder || '');
      setAccountType((data.profile.accountType as AccountType) || '');
      setProfileMask({
        account: data.profile.accountNumberMasked,
        branch: data.profile.branchCodeMasked,
      });
      setHasSavedProfile(true);
      setMode('view');
    } else {
      setProfileMask(null);
      setHasSavedProfile(false);
      setMode('create');
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!branchId) return;
    setProfileLoading(true);
    try {
      const data = await getBranchWithdrawalProfile(branchId);
      applyResponse(data);
      setAccountNumber('');
      setBranchCode('');
    } catch {
      toast({ title: 'Could not load bank details', variant: 'destructive' });
    } finally {
      setProfileLoading(false);
    }
  }, [branchId, applyResponse, toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSaveBank = async () => {
    if (!canEdit) return;
    setSavingBank(true);
    try {
      const body = {
        bankName,
        accountHolder,
        accountNumber: accountNumber.trim() || undefined,
        branchCode: branchCode.trim() || undefined,
        accountType: accountType || undefined,
      };
      const result =
        mode === 'replace'
          ? await replaceBranchWithdrawalProfile(branchId, {
              ...body,
              accountNumber: accountNumber.trim(),
              branchCode: branchCode.trim(),
              confirmReplace: true,
            })
          : await saveBranchWithdrawalProfile(branchId, body);
      applyResponse(result);
      setReplaceDialogOpen(false);
      setAccountNumber('');
      setBranchCode('');
      toast({
        title: mode === 'replace' ? 'Bank account replaced' : 'Bank details saved',
        description: postSaveVerificationMessage(),
      });
      onSaved?.();
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

  const handleRemove = async () => {
    if (!canEdit) return;
    setRemoving(true);
    try {
      const data = await removeBranchWithdrawalProfile(branchId);
      applyResponse(data);
      setBankName('');
      setAccountHolder('');
      setAccountType('');
      setRemoveDialogOpen(false);
      toast({ title: 'Bank account removed' });
      onSaved?.();
    } catch (error) {
      toast({
        title: 'Could not remove bank account',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  };

  const showForm = mode === 'create' || mode === 'edit' || mode === 'replace';
  const gatewayLabel = gatewaySettlementLabel(gatewaySettlementSupported, gatewayProfile);

  return (
    <div className="mt-4 space-y-6">
      <div className="card-elevated space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Bank Details</h2>
          <Badge className={cn('ml-auto', payoutStatusBadgeClass(verificationStatus))}>
            {payoutVerificationLabel(verificationStatus)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete your branch banking details to receive payments for material orders. Verification is
          confirmed by the payment gateway — saving does not mark the account verified.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              {hasSavedProfile ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-muted-foreground" />
              )}
              Bank account
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasSavedProfile && profileMask ? profileMask.account : 'Not configured'}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
            <div className="font-medium">Gateway settlement</div>
            <p className="mt-1 text-xs text-muted-foreground">{gatewayLabel}</p>
          </div>
        </div>

        {!gatewaySettlementSupported && settlementSummary && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            Customer payments are recorded when confirmed. Automatic bank settlement will begin when a
            marketplace-capable payment gateway is connected.
          </p>
        )}

        {hasSavedProfile && mode === 'view' && profileMask && (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            On file: {bankName} · {accountHolder} · account {profileMask.account}, branch {profileMask.branch}.
            {verificationStatus !== 'VERIFIED' ? ` ${postSaveVerificationMessage()}` : ''}
          </p>
        )}

        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            Only branch managers can update bank details. Contact your branch manager to make changes.
          </p>
        )}

        {profileLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : showForm && canEdit ? (
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
                placeholder={
                  mode === 'replace' ? 'New branch code' : profileMask ? 'Leave blank to keep' : 'e.g. 632005'
                }
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
                placeholder={
                  mode === 'replace' ? 'New account number' : profileMask ? 'Leave blank to keep' : 'Account number'
                }
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
            <div>
              <Label htmlFor="branch-account-type">Account type</Label>
              <Select value={accountType || undefined} onValueChange={(v) => setAccountType(v as AccountType)}>
                <SelectTrigger id="branch-account-type" className="mt-1">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="SAVINGS">Savings</SelectItem>
                  <SelectItem value="CURRENT">Current</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {canEdit && (
          <div className="flex flex-wrap gap-3">
            {mode === 'view' && hasSavedProfile ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setMode('edit')}>
                  Edit bank details
                </Button>
                <Button type="button" variant="outline" onClick={() => setReplaceDialogOpen(true)}>
                  Replace bank account
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive"
                  disabled={!canRemove}
                  title={!canRemove ? removeBlockedMessage(removeBlockedReason) : undefined}
                  onClick={() => setRemoveDialogOpen(true)}
                >
                  Remove bank account
                </Button>
                {!canRemove && removeBlockedReason ? (
                  <p className="w-full text-xs text-muted-foreground">
                    {removeBlockedMessage(removeBlockedReason)}
                  </p>
                ) : null}
              </>
            ) : showForm ? (
              <>
                <Button type="button" onClick={() => void handleSaveBank()} disabled={savingBank || profileLoading}>
                  {savingBank ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save bank details'}
                </Button>
                {hasSavedProfile ? (
                  <Button type="button" variant="ghost" onClick={() => setMode('view')} disabled={savingBank}>
                    Cancel
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>

      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              Replacing branch bank details resets verification. Enter the full new account. Settlements may
              pause until the gateway verifies the new account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setMode('replace');
                setAccountNumber('');
                setBranchCode('');
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates branch bank details. Add them again before settlements can be sent to your
              bank.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removing}
              onClick={() => void handleRemove()}
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
