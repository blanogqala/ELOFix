import { useCallback, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getProviderEarnings,
  getProviderBalance,
  getProviderEarningJob,
  getWithdrawalProfile,
  saveWithdrawalProfile,
  requestWithdrawal,
  getProviderTransactions,
  type ProviderEarningJobRow,
  type ProviderBalanceSnapshot,
  type ProviderTransactionRow,
} from '@/lib/api/providerAccount';
import {
  getJobReleasedAmount,
  getJobRemainingAmount,
  getJobStatus,
  getJobTotalPrice,
  getJobProviderNet,
  getJobProviderReleaseProgress,
  getJobClawbackAmount,
  getJobNetReleasedAfterRefund,
  jobHasRefundImpact,
  getStatusColor,
  sumProviderNetAcrossJobs,
  sumReleasedAcrossJobs,
} from '@/lib/providerEarningsDerived';
import { RefundSummaryLine, hasRefundDisplay } from '@/components/payments/RefundSummaryLine';
import { queryKeys } from '@/lib/queryKeys';
import {
  DollarSign,
  CheckCircle,
  Clock,
  Landmark,
  Loader2,
  Briefcase,
  ArrowLeft,
  ExternalLink,
  Wallet,
  RotateCcw,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const PREFETCH_DEBOUNCE_MS = 220;

export default function ProviderEarnings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [balance, setBalance] = useState<ProviderBalanceSnapshot | null>(null);
  const [jobs, setJobs] = useState<ProviderEarningJobRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<ProviderEarningJobRow | null>(null);
  const [customerNameCache, setCustomerNameCache] = useState<Record<string, string>>({});
  const prefetchedIdsRef = useRef<Set<string>>(new Set());
  const prefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [bankMask, setBankMask] = useState<{ account: string; branch: string } | null>(null);
  const [transactions, setTransactions] = useState<ProviderTransactionRow[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const loadEarnings = useCallback(async () => {
    if (!user) return;
    try {
      const [data, bal] = await Promise.all([getProviderEarnings(), getProviderBalance()]);
      setBalance({
        available: bal.available,
        pending: bal.pending,
        withdrawn: bal.withdrawn,
        refundDebtOwed: bal.refundDebtOwed ?? 0,
        totalClawback: bal.totalClawback ?? 0,
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

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setTransactionsLoading(true);
    try {
      const { transactions: rows } = await getProviderTransactions();
      setTransactions(rows);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Could not load transaction history',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setTransactionsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      void loadEarnings();
      void loadProfile();
      void loadTransactions();
    }
  }, [user, loadEarnings, loadProfile, loadTransactions]);

  useEffect(() => {
    setSelectedJob((prev) => {
      if (!prev) return null;
      const next = jobs.find((j) => j.id === prev.id);
      return next ?? null;
    });
  }, [jobs]);

  const yourTotalEarnings = sumProviderNetAcrossJobs(jobs);
  const amountReleasedToYou = sumReleasedAcrossJobs(jobs);
  const pendingBalanceFromJobs = jobs.reduce((sum, j) => sum + getJobRemainingAmount(j), 0);

  const available = balance?.available ?? 0;
  const refundDebtOwed = balance?.refundDebtOwed ?? 0;
  const totalClawback = balance?.totalClawback ?? 0;
  const withdrawNum = parseFloat(withdrawAmount);
  const withdrawExceeds =
    Number.isFinite(withdrawNum) && withdrawNum > 0 && withdrawNum > available + 1e-6;

  const selectedJobId = selectedJob?.id ?? null;

  const { data: earningJobResponse, isFetching: detailFetching } = useQuery({
    queryKey: queryKeys.providerEarnings.job(selectedJobId ?? ''),
    queryFn: () => getProviderEarningJob(selectedJobId!),
    enabled: Boolean(selectedJobId),
  });

  const detailJob = earningJobResponse?.job;
  const mergedPanelJob: ProviderEarningJobRow | null =
    selectedJob && detailJob && detailJob.id === selectedJob.id ? { ...selectedJob, ...detailJob } : selectedJob;

  useEffect(() => {
    if (!selectedJobId || !detailJob?.customerName || detailJob.id !== selectedJobId) return;
    setCustomerNameCache((prev) => ({ ...prev, [selectedJobId]: detailJob.customerName! }));
  }, [selectedJobId, detailJob?.customerName, detailJob?.id]);

  const mergeCustomerIntoCache = useCallback((jobId: string, name: string | undefined) => {
    if (!name?.trim()) return;
    setCustomerNameCache((prev) => (prev[jobId] === name ? prev : { ...prev, [jobId]: name }));
  }, []);

  const schedulePrefetchCustomer = useCallback(
    (jobId: string) => {
      if (prefetchedIdsRef.current.has(jobId)) return;
      if (customerNameCache[jobId]) return;
      if (prefetchDebounceRef.current) clearTimeout(prefetchDebounceRef.current);
      prefetchDebounceRef.current = setTimeout(() => {
        prefetchDebounceRef.current = null;
        if (prefetchedIdsRef.current.has(jobId)) return;
        prefetchedIdsRef.current.add(jobId);
        void queryClient
          .fetchQuery({
            queryKey: queryKeys.providerEarnings.job(jobId),
            queryFn: () => getProviderEarningJob(jobId),
          })
          .then((res) => {
            mergeCustomerIntoCache(jobId, res.job.customerName);
          })
          .catch(() => {
            prefetchedIdsRef.current.delete(jobId);
          });
      }, PREFETCH_DEBOUNCE_MS);
    },
    [queryClient, customerNameCache, mergeCustomerIntoCache],
  );

  useEffect(() => {
    return () => {
      if (prefetchDebounceRef.current) clearTimeout(prefetchDebounceRef.current);
    };
  }, []);

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
      await Promise.all([loadEarnings(), loadProfile(), loadTransactions()]);
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

  const panelCustomerGross = mergedPanelJob ? getJobTotalPrice(mergedPanelJob) : 0;
  const panelProviderNet = mergedPanelJob ? getJobProviderNet(mergedPanelJob) : 0;
  const panelCommission = mergedPanelJob
    ? (Number(mergedPanelJob.commissionAmount) || 0)
    : 0;
  const panelReleased = mergedPanelJob ? getJobReleasedAmount(mergedPanelJob) : 0;
  const panelRemaining = mergedPanelJob ? getJobRemainingAmount(mergedPanelJob) : 0;
  const derivedDetailStatus = mergedPanelJob ? getJobStatus(mergedPanelJob) : 'Pending';
  const panelProgress = mergedPanelJob ? getJobProviderReleaseProgress(mergedPanelJob) : 0;
  const panelPercent = panelProgress * 100;
  const panelPercentRounded = Math.round(panelPercent);

  const panelClawback = mergedPanelJob ? getJobClawbackAmount(mergedPanelJob) : 0;
  const panelNetReleased = mergedPanelJob ? getJobNetReleasedAfterRefund(mergedPanelJob) : 0;
  const panelEscrowReversed = mergedPanelJob
    ? Number(mergedPanelJob.escrowReversed ?? mergedPanelJob.refundDetails?.escrowApplied) || 0
    : 0;
  const panelRefundDebt = mergedPanelJob
    ? Number(mergedPanelJob.providerRefundDebt ?? mergedPanelJob.refundDetails?.providerDebtAdded) || 0
    : 0;
  const panelHasRefund = mergedPanelJob ? jobHasRefundImpact(mergedPanelJob) : false;

  const transactionAmountClass = (kind: ProviderTransactionRow['kind']) => {
    if (kind === 'withdrawal') return 'text-foreground';
    return 'text-destructive';
  };

  const transactionKindLabel = (tx: ProviderTransactionRow) => {
    if (tx.kind === 'withdrawal') return 'Bank withdrawal';
    if (tx.kind === 'refund_clawback') return 'Refund recovery';
    if (tx.kind === 'debt_recovery') return 'Debt recovered';
    if (tx.kind === 'refund_debt') return 'Refund debt';
    return tx.description;
  };

  const withdrawalStatusClass = (s: string) => {
    const v = s.toLowerCase();
    if (v === 'paid') return 'text-success';
    if (v === 'failed') return 'text-destructive';
    if (v === 'approved') return 'text-primary';
    return 'text-muted-foreground';
  };

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Earnings</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Your total earnings (net of platform fee), released amounts, and escrow (ZAR)
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 sm:h-12 sm:w-12">
                <DollarSign className="h-4 w-4 text-success sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate sm:text-lg lg:text-xl xl:text-2xl">
                  {formatCurrency(yourTotalEarnings)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Your total earnings</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
                <Clock className="h-4 w-4 text-warning sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate sm:text-lg lg:text-xl xl:text-2xl">
                  {formatCurrency(pendingBalanceFromJobs)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Remaining to you (escrow)</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                <CheckCircle className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate sm:text-lg lg:text-xl xl:text-2xl">
                  {formatCurrency(amountReleasedToYou)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Amount released to you</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-12 sm:w-12">
                <Wallet className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate sm:text-lg lg:text-xl xl:text-2xl">
                  {formatCurrency(available)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Available to withdraw</p>
                {totalClawback > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 sm:text-xs">
                    Includes {formatCurrency(totalClawback)} deducted for customer refunds
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 sm:h-12 sm:w-12">
                <RotateCcw className="h-4 w-4 text-destructive sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate text-destructive sm:text-lg lg:text-xl xl:text-2xl">
                  {refundDebtOwed > 0 ? `−${formatCurrency(refundDebtOwed)}` : formatCurrency(0)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Refund owed</p>
                {refundDebtOwed > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 sm:text-xs">
                    Auto-deducted from available balance and future job earnings
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-4 md:-mt-6">
          Job sums use amounts from the server. Bank withdrawals use your ledger balance on the Withdrawal tab.
        </p>

        <Tabs
          defaultValue="jobs"
          className="w-full"
          onValueChange={(v) => {
            if (v !== 'jobs') setSelectedJob(null);
          }}
        >
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="withdraw">Withdrawal</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="mt-4 space-y-4">
            <div
              className={cn(
                'card-elevated overflow-hidden transition-all duration-300 ease-out',
              )}
            >
              {!selectedJob ? (
                <div className="transition-all duration-300 ease-out">
                  <div className="border-b-2 border-primary/50 p-4 sm:p-6">
                    <h2 className="text-lg font-semibold tracking-tight">Jobs</h2>
                    <p className="text-sm text-muted-foreground">
                      Tap a job to see payment details and progress
                    </p>
                  </div>
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground transition-all duration-300">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading…
                    </div>
                  ) : jobs.length > 0 ? (
                    <ul className="max-h-[min(520px,65vh)] divide-y divide-border overflow-y-auto">
                      {jobs.map((job) => {
                        const totalP = getJobTotalPrice(job);
                        const released = getJobReleasedAmount(job);
                        const clawback = getJobClawbackAmount(job);
                        const netReleased = getJobNetReleasedAfterRefund(job);
                        const remaining = getJobRemainingAmount(job);
                        const hasRefund = jobHasRefundImpact(job);
                        const fromRow = job.customerName?.trim();
                        const customerDisplay = customerNameCache[job.id] ?? (fromRow || '—');
                        const displayStatus = getJobStatus(job);
                        return (
                          <li key={job.id} className="transition-all duration-300">
                            <button
                              type="button"
                              onClick={() => setSelectedJob(job)}
                              onMouseEnter={() => schedulePrefetchCustomer(job.id)}
                              className={cn(
                                'flex w-full min-w-0 flex-col gap-2 p-4 text-left transition-all duration-300',
                                'hover:bg-primary/20 hover:shadow-sm active:scale-[0.99]',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium leading-snug line-clamp-2">{job.title}</span>
                                <p className={cn('shrink-0 text-xs font-semibold', getStatusColor(displayStatus))}>
                                  {displayStatus}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Customer: <span className="text-foreground/90">{customerDisplay}</span>
                              </p>
                              <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                                <div>
                                  <p className="text-muted-foreground">Job price (customer)</p>
                                  <p className="font-semibold tabular-nums">{formatCurrency(totalP)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Released to you</p>
                                  <p className="font-semibold tabular-nums text-primary">{formatCurrency(released)}</p>
                                </div>
                                <div>
                                  {hasRefund && clawback > 0 ? (
                                    <>
                                      <p className="text-muted-foreground">Taken back (refund)</p>
                                      <p className="font-semibold tabular-nums text-destructive">
                                        −{formatCurrency(clawback)}
                                      </p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-muted-foreground">Remaining to you</p>
                                      <p className="font-semibold tabular-nums">{formatCurrency(remaining)}</p>
                                    </>
                                  )}
                                </div>
                              </div>
                              {hasRefund && clawback > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Net you kept:{' '}
                                  <span className="font-semibold tabular-nums text-foreground">
                                    {formatCurrency(netReleased)}
                                  </span>
                                </p>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="flex flex-col items-center gap-3 p-10 text-center transition-all duration-300">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Briefcase className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">No jobs yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Assigned jobs will appear here with payment breakdowns.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="transition-all duration-300 ease-out">
                  <div className="grid grid-cols-2 gap-4 border-b-2 border-primary/30 p-4 sm:p-6">
                    <div className="justify-self-start">
                      <h2 className="text-lg font-semibold tracking-tight">Job details</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Earnings and release progress for this job</p>
                    </div>
                    <div className="justify-self-end">
                      <Button
                        type="button"
                        variant="ghost"
                        className="mb-3 -ml-2 h-auto gap-2 px-2 py-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedJob(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                    </div>
                    
                  </div>
                  {mergedPanelJob ? (
                    <div className="space-y-5 p-4 text-sm sm:p-6">
                      <div>
                        <p className=" text-base font-semibold leading-snug sm:text-lg">{mergedPanelJob.title}</p>
                        {detailFetching && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Refreshing details…
                          </p>
                        )}
                      </div>
                      <p className="text-xs font-medium uppercase tracking-wide text-accent">Customer</p>
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Name</dt>
                          <dd className="text-right font-medium">
                            {mergedPanelJob.customerName?.trim() || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Total price (what they paid)</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(panelCustomerGross)}
                          </dd>
                        </div>
                      </dl>
                      <p className="pt-2 text-xs font-medium uppercase tracking-wide text-accent">Your share</p>
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Platform fee (7%)</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(panelCommission || 0)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Your earnings</dt>
                          <dd className="text-right font-semibold tabular-nums text-foreground">
                            {formatCurrency(panelProviderNet)}
                          </dd>
                        </div>
                      </dl>
                      <p className="pt-2 text-xs font-medium uppercase tracking-wide text-accent">
                        Your payments
                      </p>
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Released amount</dt>
                          <dd className="text-right font-semibold tabular-nums text-primary">
                            {formatCurrency(panelReleased)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Remaining amount</dt>
                          <dd className="text-right font-semibold tabular-nums">{formatCurrency(panelRemaining)}</dd>
                        </div>
                        {panelHasRefund && (
                          <>
                            {hasRefundDisplay(mergedPanelJob) && (
                              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                                <RefundSummaryLine
                                  refundAmount={mergedPanelJob.refundAmount}
                                  refundStatus={mergedPanelJob.refundStatus}
                                />
                              </div>
                            )}
                            {panelClawback > 0 && (
                              <div className="flex justify-between gap-4">
                                <dt className="text-muted-foreground">Taken back from your balance</dt>
                                <dd className="text-right font-semibold tabular-nums text-destructive">
                                  −{formatCurrency(panelClawback)}
                                </dd>
                              </div>
                            )}
                            {panelEscrowReversed > 0 && (
                              <div className="flex justify-between gap-4">
                                <dt className="text-muted-foreground">Escrow reversed (not released)</dt>
                                <dd className="text-right font-semibold tabular-nums text-destructive">
                                  −{formatCurrency(panelEscrowReversed)}
                                </dd>
                              </div>
                            )}
                            {panelRefundDebt > 0 && (
                              <div className="flex justify-between gap-4">
                                <dt className="text-muted-foreground">Outstanding refund debt</dt>
                                <dd className="text-right font-semibold tabular-nums text-destructive">
                                  {formatCurrency(panelRefundDebt)}
                                </dd>
                              </div>
                            )}
                            <div className="flex justify-between gap-4 border-t border-border pt-2">
                              <dt className="font-medium text-foreground">Net you kept from this job</dt>
                              <dd className="text-right font-semibold tabular-nums">{formatCurrency(panelNetReleased)}</dd>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Status</dt>
                          <dd className="text-right">
                            <p className={cn('font-semibold', getStatusColor(derivedDetailStatus))}>
                              {derivedDetailStatus}
                            </p>
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Created</dt>
                          <dd className="text-right tabular-nums text-foreground/90">
                            {new Date(mergedPanelJob.createdAt).toLocaleString()}
                          </dd>
                        </div>
                      </dl>
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Release progress (your share)</span>
                          <span className="font-medium text-foreground">{panelPercentRounded}%</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                            style={{ width: `${panelPercent}%` }}
                          />
                        </div>
                      </div>
                      <div className="pt-2">
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                          <Link
                            to={`/provider/jobs/${mergedPanelJob.id}`}
                            className="inline-flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open full job page
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="withdraw" className="mt-4 space-y-6">
            <div className="card-elevated p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Withdrawal methods</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Bank details are stored encrypted. Ledger balance available to withdraw: {formatCurrency(available)}.
              </p>
              {(totalClawback > 0 || refundDebtOwed > 0) && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                  {totalClawback > 0 && (
                    <p>
                      Refund deductions from balance:{' '}
                      <span className="font-semibold text-destructive tabular-nums">
                        −{formatCurrency(totalClawback)}
                      </span>
                    </p>
                  )}
                  {refundDebtOwed > 0 && (
                    <p>
                      Outstanding refund debt (auto-recovered from future releases):{' '}
                      <span className="font-semibold text-destructive tabular-nums">
                        {formatCurrency(refundDebtOwed)}
                      </span>
                    </p>
                  )}
                </div>
              )}
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
                <p className="text-xs text-destructive">
                  Amount exceeds available balance ({formatCurrency(available)}).
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Withdrawals are created as pending requests and processed according to platform policy.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="card-elevated overflow-hidden">
              <div className="border-b border-border p-4 sm:p-6">
                <h2 className="text-lg font-semibold">Transaction history</h2>
                <p className="text-sm text-muted-foreground">
                  Bank withdrawals and automatic refund deductions from your balance
                </p>
              </div>
              {transactionsLoading ? (
                <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : transactions.length > 0 ? (
                <ul className="divide-y divide-border p-4 sm:p-6 space-y-0">
                  {transactions.map((tx) => (
                    <li key={`${tx.kind}-${tx.id}`} className="card-elevated p-4 first:mt-0 mt-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{transactionKindLabel(tx)}</p>
                          {tx.jobTitle && (
                            <p className="text-sm text-muted-foreground truncate">Job: {tx.jobTitle}</p>
                          )}
                        </div>
                        <p
                          className={cn(
                            'text-lg font-semibold tabular-nums shrink-0',
                            transactionAmountClass(tx.kind)
                          )}
                        >
                          {tx.kind === 'withdrawal' ? '' : '−'}
                          {formatCurrency(tx.amount)}
                        </p>
                      </div>
                      {tx.kind === 'withdrawal' && tx.status && (
                        <p className={cn('mt-1 text-sm font-semibold capitalize', withdrawalStatusClass(tx.status))}>
                          {tx.status}
                        </p>
                      )}
                      {tx.kind !== 'withdrawal' && (
                        <p className="mt-1 text-xs text-muted-foreground">{tx.description}</p>
                      )}
                      <p className="mt-2 text-sm text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Ref: {tx.id.slice(0, 8)}…</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Wallet className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">No transactions yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Withdrawals and refund deductions will appear here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
