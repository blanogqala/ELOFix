import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { AlertTriangle, CheckCircle2, Landmark, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getWithdrawalProfile,
  removeWithdrawalProfile,
  replaceWithdrawalProfile,
  saveWithdrawalProfile,
  type PayoutVerificationStatus,
  type WithdrawalAccountType,
  type WithdrawalProfile,
} from '@/lib/api/providerAccount';
import {
  gatewaySettlementLabel,
  payoutStatusBadgeClass,
  payoutVerificationLabel,
  postSaveVerificationMessage,
  removeBlockedMessage,
} from '@/lib/payoutBankingDisplay';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  showEarningsLink?: boolean;
  onSaved?: (hasPayoutProfile: boolean) => void;
  onStatusChange?: (hasPayoutProfile: boolean) => void;
  onContinue?: () => void;
};

type PanelMode = 'view' | 'edit' | 'replace' | 'create';

export function ProviderPayoutBankingPanel({
  className,
  showEarningsLink,
  onSaved,
  onStatusChange,
  onContinue,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>('create');
  const [profile, setProfile] = useState<WithdrawalProfile | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<PayoutVerificationStatus>('NOT_CONFIGURED');
  const [gatewaySettlementSupported, setGatewaySettlementSupported] = useState(false);
  const [canRemove, setCanRemove] = useState(false);
  const [removeBlockedReason, setRemoveBlockedReason] = useState<string | undefined>();

  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountType, setAccountType] = useState<WithdrawalAccountType | ''>('');

  const applyResponse = useCallback(
    (data: Awaited<ReturnType<typeof getWithdrawalProfile>>) => {
      setProfile(data.profile);
      setVerificationStatus((data.verificationStatus as PayoutVerificationStatus) || 'NOT_CONFIGURED');
      setGatewaySettlementSupported(Boolean(data.gatewaySettlementSupported));
      setCanRemove(Boolean(data.canRemove));
      setRemoveBlockedReason(data.removeBlockedReason);
      if (data.profile) {
        setBankName(data.profile.bankName || '');
        setAccountHolder(data.profile.accountHolder || '');
        setAccountType((data.profile.accountType as WithdrawalAccountType) || '');
        setMode('view');
      } else {
        setMode('create');
      }
      onStatusChange?.(data.profile != null);
    },
    [onStatusChange]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWithdrawalProfile();
      applyResponse(data);
      setAccountNumber('');
      setBranchCode('');
    } catch (error) {
      toast({
        title: 'Could not load payout details',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [applyResponse, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildPayload = (requireFullAccount: boolean) => {
    const payload = {
      bankName: bankName.trim(),
      accountHolder: accountHolder.trim(),
      accountNumber: accountNumber.trim() || undefined,
      branchCode: branchCode.trim() || undefined,
      accountType: accountType || undefined,
    };
    if (requireFullAccount) {
      if (!payload.accountNumber || !payload.branchCode) {
        throw new Error('Account number and branch code are required');
      }
    } else if (!profile && (!payload.accountNumber || !payload.branchCode)) {
      throw new Error('Account number and branch code are required');
    }
    if (!profile && !accountType) {
      throw new Error('Account type is required');
    }
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(mode === 'replace');
      const data =
        mode === 'replace'
          ? await replaceWithdrawalProfile({ ...payload, confirmReplace: true })
          : await saveWithdrawalProfile(payload);
      applyResponse(data);
      setAccountNumber('');
      setBranchCode('');
      setReplaceDialogOpen(false);
      onSaved?.(data.profile != null);
      toast({
        title: mode === 'replace' ? 'Bank account replaced' : 'Payout details saved',
        description: postSaveVerificationMessage(),
      });
    } catch (error) {
      toast({
        title: 'Could not save payout details',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const data = await removeWithdrawalProfile();
      applyResponse(data);
      setBankName('');
      setAccountHolder('');
      setAccountType('');
      setRemoveDialogOpen(false);
      onSaved?.(false);
      toast({ title: 'Bank account removed' });
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
  const gatewayLabel = gatewaySettlementLabel(
    gatewaySettlementSupported,
    profile?.gatewaySettlementProfile
  );

  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden />
          Payout &amp; Banking
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Add your payout details so EloFix can route eligible provider settlements to your nominated
          account. Verification is confirmed by the payment gateway — saving details does not mark your
          account verified.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Payout account</p>
          <Badge className={payoutStatusBadgeClass(verificationStatus)}>
            {payoutVerificationLabel(verificationStatus)}
          </Badge>
        </div>
        {profile && mode === 'view' ? (
          <>
            <p className="text-sm">
              Bank account {profile.accountNumberMasked}
              {profile.branchCodeMasked ? ` · branch ${profile.branchCodeMasked}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {profile.bankName} · {profile.accountHolder}
              {profile.accountType ? ` · ${profile.accountType}` : ''}
            </p>
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Gateway settlement:</span>
          <Badge variant="outline">{gatewayLabel}</Badge>
        </div>
        {verificationStatus === 'VERIFIED' ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Gateway confirmed this account for settlements.
          </p>
        ) : verificationStatus === 'ACTION_REQUIRED' ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Review is required before this account can be used for settlements.
          </p>
        ) : profile && mode === 'view' ? (
          <p className="text-sm text-muted-foreground">{postSaveVerificationMessage()}</p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : showForm ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="payout-holder">Account holder name</Label>
            <Input
              id="payout-holder"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className="mt-1"
              autoComplete="name"
            />
          </div>
          <div>
            <Label htmlFor="payout-bank">Bank name</Label>
            <Input
              id="payout-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="mt-1"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Account type</Label>
            <Select
              value={accountType || undefined}
              onValueChange={(v) => setAccountType(v as WithdrawalAccountType)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="SAVINGS">Savings</SelectItem>
                <SelectItem value="CURRENT">Current</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="payout-account">Account number</Label>
            <Input
              id="payout-account"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="mt-1"
              autoComplete="off"
              placeholder={
                mode === 'replace' ? 'New account number' : profile ? 'Leave blank to keep current' : 'Account number'
              }
            />
          </div>
          <div>
            <Label htmlFor="payout-branch">Branch code</Label>
            <Input
              id="payout-branch"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              className="mt-1"
              autoComplete="off"
              placeholder={
                mode === 'replace' ? 'New branch code' : profile ? 'Leave blank to keep current' : 'e.g. 250655'
              }
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {mode === 'view' && profile ? (
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
              <p className="w-full text-xs text-muted-foreground">{removeBlockedMessage(removeBlockedReason)}</p>
            ) : null}
          </>
        ) : showForm ? (
          <>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            {profile ? (
              <Button type="button" variant="ghost" onClick={() => setMode('view')} disabled={saving}>
                Cancel
              </Button>
            ) : null}
          </>
        ) : null}
        {profile != null && onContinue ? (
          <Button type="button" variant="secondary" onClick={onContinue} disabled={saving || loading}>
            Continue
          </Button>
        ) : null}
        {showEarningsLink ? (
          <Button type="button" variant="outline" asChild>
            <Link to="/provider/earnings">View earnings</Link>
          </Button>
        ) : null}
      </div>

      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              Replacing your bank account resets verification. You must enter the full new account details.
              Settlements may pause until the gateway verifies the new account.
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
              This deactivates your payout profile. You will need to add bank details again before
              settlements can be sent to your account.
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
