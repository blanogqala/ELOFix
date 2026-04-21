import { useCallback, useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getProviderEarnings,
  getProviderBalance,
  getWithdrawalProfile,
  saveWithdrawalProfile,
  requestWithdrawal,
  type ProviderEarningJobRow,
  type ProviderEarningsSummary,
  type ProviderBalanceSnapshot,
} from '@/lib/api/providerAccount';
import { DollarSign, TrendingUp, CheckCircle, Clock, Landmark, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

function statusLabel(row: ProviderEarningJobRow): string {
  if (row.paymentReleased) return 'Released';
  if (row.laborPaid) return 'Pending release';
  return 'Pending';
}

export default function ProviderEarnings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<ProviderEarningsSummary | null>(null);
  const [balance, setBalance] = useState<ProviderBalanceSnapshot | null>(null);
  const [jobs, setJobs] = useState<ProviderEarningJobRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [bankMask, setBankMask] = useState<{ account: string; branch: string } | null>(null);

  const loadEarnings = useCallback(async () => {
    if (!user) return;
    try {
      const [data, bal] = await Promise.all([getProviderEarnings(), getProviderBalance()]);
      setSummary(data.summary);
      setBalance({
        available: bal.available,
        pending: bal.pending,
        withdrawn: bal.withdrawn,
      });
      setJobs(data.jobs);
    } catch (error) {
      console.error('Failed to load earnings:', error);
      toast({
        title: 'Could not load earnings',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { profile } = await getWithdrawalProfile();
      if (profile) {
        setBankName(profile.bankName);
        setAccountNumber('');
        setAccountHolder(profile.accountHolder);
        setBranchCode('');
        setBankMask({ account: profile.accountNumberMasked, branch: profile.branchCodeMasked });
      } else {
        setBankMask(null);
      }
    } catch (error) {
      console.error(error);
      toast({
        title: 'Could not load bank details',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setProfileLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      void loadEarnings();
      void loadProfile();
    }
  }, [user, loadEarnings, loadProfile]);

  const releasedTotal = summary?.totalReleased ?? 0;
  const available = balance?.available ?? summary?.available ?? 0;
  const pendingBal = balance?.pending ?? 0;
  const withdrawnTotal = balance?.withdrawn ?? 0;
  const withdrawNum = parseFloat(withdrawAmount);
  const withdrawExceeds =
    Number.isFinite(withdrawNum) && withdrawNum > 0 && withdrawNum > available + 1e-6;

  const handleSaveBank = async () => {
    setSavingBank(true);
    try {
      await saveWithdrawalProfile({
        bankName,
        accountNumber,
        accountHolder,
        branchCode,
      });
      toast({ title: 'Withdrawal details saved' });
      await loadProfile();
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Check all fields.',
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
      await requestWithdrawal(n);
      toast({ title: 'Withdrawal requested', description: 'Your request is pending processing.' });
      setWithdrawAmount('');
      await Promise.all([loadEarnings(), loadProfile()]);
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

  const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : null;

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Earnings</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Track released payouts and withdrawals (ZAR)</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 sm:h-12 sm:w-12">
                <DollarSign className="h-4 w-4 text-success sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(releasedTotal)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Total released (pool)</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
                <Clock className="h-4 w-4 text-warning sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(pendingBal)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending balance</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                <CheckCircle className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(available)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Available to withdraw</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-12 sm:w-12">
                <TrendingUp className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(withdrawnTotal)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Withdrawn total</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="jobs" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="withdraw">Withdrawal</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="mt-4 space-y-4">
            <div className="card-elevated overflow-hidden lg:grid lg:grid-cols-2 lg:divide-x lg:divide-border">
              <div className="border-b border-border lg:border-b-0">
                <div className="border-b border-border p-4 sm:p-6">
                  <h2 className="text-lg font-semibold">Jobs</h2>
                  <p className="text-sm text-muted-foreground">Amounts follow escrow release to you</p>
                </div>
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading…
                  </div>
                ) : jobs.length > 0 ? (
                  <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                    {jobs.map((job) => (
                      <li key={job.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedJobId(job.id)}
                          className={`flex w-full min-w-0 flex-col gap-1 p-4 text-left transition-colors hover:bg-muted/50 ${
                            selectedJobId === job.id ? 'bg-muted/60' : ''
                          }`}
                        >
                          <span className="font-medium line-clamp-2">{job.title}</span>
                          <span className="text-xs text-muted-foreground">{statusLabel(job)}</span>
                          <span className="text-sm font-semibold text-primary">{formatCurrency(job.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">No jobs yet</div>
                )}
              </div>
              <div className="p-4 sm:p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Job detail</h3>
                {selectedJob ? (
                  <div className="space-y-3 text-sm">
                    <p className="font-semibold">{selectedJob.title}</p>
                    <p>
                      <span className="text-muted-foreground">Service price: </span>
                      {formatCurrency(selectedJob.amount)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Payment: </span>
                      {statusLabel(selectedJob)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Created: </span>
                      {new Date(selectedJob.createdAt).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a job to view details</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="withdraw" className="mt-4 space-y-6">
            <div className="card-elevated p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Withdrawal methods</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Bank details are stored encrypted. Available balance: {formatCurrency(available)}.
              </p>
              {bankMask && (
                <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2">
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
                    <Label htmlFor="bank-name">Bank name</Label>
                    <Input
                      id="bank-name"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="mt-1"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="branch">Branch code</Label>
                    <Input
                      id="branch"
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value)}
                      className="mt-1"
                      autoComplete="off"
                      placeholder={bankMask ? 'Leave blank to keep' : 'e.g. 632005'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="account">Account number</Label>
                    <Input
                      id="account"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="mt-1"
                      autoComplete="off"
                      placeholder={bankMask ? 'Leave blank to keep' : 'Account number'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="holder">Account holder</Label>
                    <Input
                      id="holder"
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

            <div className="card-elevated p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-semibold">Request withdrawal</h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="withdraw-amt">Amount (ZAR)</Label>
                  <Input
                    id="withdraw-amt"
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
                <p className="text-xs text-destructive">Amount exceeds available balance ({formatCurrency(available)}).</p>
              )}
              <p className="text-xs text-muted-foreground">
                Withdrawals are created as pending requests and processed according to platform policy.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
