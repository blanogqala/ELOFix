import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getProviderEarnings,
  getProviderBalance,
  getProviderEarningJob,
  getProviderTransactions,
  getProviderRefundDebt,
  type ProviderEarningJobRow,
  type ProviderBalanceSnapshot,
  type ProviderTransactionRow,
  type ProviderRefundDebtSummary,
  type ProviderSettlementRecord,
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
  sumNetProviderKeptAcrossJobs,
  sumProviderEscrowRemaining,
  getJobCustomerPaid,
  getJobCustomerRemaining,
  getJobProviderShareRecorded,
  getJobProviderShareRemaining,
  sumProviderShareRemainingAcrossJobs,
} from '@/lib/providerEarningsDerived';
import {
  countPaidSettlementStages,
  groupSettlementRecordsByJob,
} from '@/lib/providerSettlementGroups';
import { ProviderSettlementJobGroups } from '@/components/provider/ProviderSettlementJobGroups';
import { RefundSummaryLine, hasRefundDisplay } from '@/components/payments/RefundSummaryLine';
import { queryKeys } from '@/lib/queryKeys';
import {
  DollarSign,
  CheckCircle,
  Clock,
  Loader2,
  Briefcase,
  ArrowLeft,
  ExternalLink,
  Wallet,
  RotateCcw,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  const [transactions, setTransactions] = useState<ProviderTransactionRow[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [providerEscrowRemaining, setProviderEscrowRemaining] = useState<number | null>(null);
  const [providerShareRecordedTotal, setProviderShareRecordedTotal] = useState(0);
  const [providerShareRemainingTotal, setProviderShareRemainingTotal] = useState<number | null>(null);
  const [hasLegacyJobs, setHasLegacyJobs] = useState(false);
  const [settlementRecords, setSettlementRecords] = useState<ProviderSettlementRecord[]>([]);
  const [refundDebtDetail, setRefundDebtDetail] = useState<ProviderRefundDebtSummary | null>(null);

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
      setProviderEscrowRemaining(
        data.summary.providerEscrowRemaining ?? data.summary.pending ?? bal.pending ?? null
      );
      setProviderShareRecordedTotal(Number(data.summary.totalProviderShareRecorded) || 0);
      setProviderShareRemainingTotal(
        data.summary.totalProviderShareRemaining != null
          ? Number(data.summary.totalProviderShareRemaining)
          : null
      );
      setHasLegacyJobs(Boolean(data.summary.hasLegacyJobs));
      setSettlementRecords(Array.isArray(data.settlementRecords) ? data.settlementRecords : []);
      setJobs(data.jobs);
      if ((bal.refundDebtOwed ?? 0) > 0) {
        try {
          const debt = await getProviderRefundDebt();
          setRefundDebtDetail(debt);
        } catch {
          setRefundDebtDetail(null);
        }
      } else {
        setRefundDebtDetail(null);
      }
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
      void loadTransactions();
    }
  }, [user, loadEarnings, loadTransactions]);

  useEffect(() => {
    setSelectedJob((prev) => {
      if (!prev) return null;
      const next = jobs.find((j) => j.id === prev.id);
      return next ?? null;
    });
  }, [jobs]);

  const yourTotalEarnings =
    providerShareRecordedTotal > 0
      ? providerShareRecordedTotal
      : sumNetProviderKeptAcrossJobs(jobs);
  const remainingToYou =
    providerShareRemainingTotal ??
    sumProviderShareRemainingAcrossJobs(jobs) ??
    (hasLegacyJobs ? providerEscrowRemaining ?? sumProviderEscrowRemaining(jobs) : 0);

  const settlementGroups = useMemo(
    () => groupSettlementRecordsByJob(settlementRecords, jobs),
    [settlementRecords, jobs]
  );
  const stageCounts = useMemo(
    () => countPaidSettlementStages(settlementGroups),
    [settlementGroups]
  );

  const available = balance?.available ?? 0;
  const refundDebtOwed = balance?.refundDebtOwed ?? 0;
  const refundDebtDueLabel = refundDebtDetail?.dueAt
    ? new Date(refundDebtDetail.dueAt).toLocaleString('en-ZA')
    : 'the due date';

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
    if (tx.kind === 'refund_escrow_reversal') return 'Refund from escrow';
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
            Provider share recorded from customer payments (ZAR). Bank payout is outside EloFix until a
            split-capable gateway is connected.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 sm:h-12 sm:w-12">
                <DollarSign className="h-4 w-4 text-success sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate sm:text-lg lg:text-xl xl:text-2xl">
                  {formatCurrency(yourTotalEarnings)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Total provider share recorded</p>
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
                  {stageCounts.paid} of {Math.max(stageCounts.expected, stageCounts.paid)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Paid/settled stages</p>
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
                  {formatCurrency(remainingToYou)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Remaining provider share</p>
              </div>
            </div>
          </div>
          {hasLegacyJobs || (balance?.available ?? 0) > 0 ? (
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-12 sm:w-12">
                <Wallet className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate sm:text-lg lg:text-xl xl:text-2xl">
                  {formatCurrency(available)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Legacy ledger balance</p>
              </div>
            </div>
          </div>
          ) : null}
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 sm:h-12 sm:w-12">
                <RotateCcw className="h-4 w-4 text-destructive sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight tabular-nums truncate text-destructive sm:text-lg lg:text-xl xl:text-2xl">
                  {refundDebtOwed > 0 ? `−${formatCurrency(refundDebtOwed)}` : formatCurrency(0)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {refundDebtOwed > 0
                    ? refundDebtDetail?.pendingRepayment
                      ? 'Repayment submitted'
                      : String(refundDebtDetail?.repaymentStatus || '').toUpperCase() === 'OVERDUE'
                        ? 'Payment overdue'
                        : 'Refund repayment due'
                    : 'Refund owed'}
                </p>
                {refundDebtOwed > 0 ? (
                  <>
                    <p className="text-[10px] text-muted-foreground mt-0.5 sm:text-xs">
                      {refundDebtDetail?.pendingRepayment
                        ? 'Awaiting EloFix verification'
                        : `Due by ${refundDebtDueLabel}`}
                    </p>
                    {refundDebtDetail?.recoveries?.[0]?.jobId ? (
                      <Link
                        to={`/provider/jobs/${refundDebtDetail.recoveries[0].jobId}/refund`}
                        className="mt-0.5 inline-block text-xs font-medium text-destructive underline-offset-2 hover:underline"
                      >
                        View repayment
                      </Link>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <Tabs
          defaultValue="jobs"
          className="w-full"
          onValueChange={(v) => {
            if (v !== 'jobs') setSelectedJob(null);
          }}
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
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
                        const customerPaid = getJobCustomerPaid(job);
                        const customerRemaining = getJobCustomerRemaining(job);
                        const shareRecorded = getJobProviderShareRecorded(job);
                        const shareRemaining = getJobProviderShareRemaining(job);
                        const clawback = getJobClawbackAmount(job);
                        const netReleased = getJobNetReleasedAfterRefund(job);
                        const hasRefund = jobHasRefundImpact(job);
                        const showRefund = hasRefundDisplay(job);
                        const escrowReversed =
                          Number(job.escrowReversed ?? job.refundDetails?.escrowApplied) || 0;
                        const fromRow = job.customerName?.trim();
                        const customerDisplay = customerNameCache[job.id] ?? (fromRow || '—');
                        const displayStatus = getJobStatus(job);
                        const paymentLabel = job.paymentLabel || '—';
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
                                <div className="shrink-0 text-right">
                                  <p className={cn('text-xs font-semibold', getStatusColor(displayStatus))}>
                                    {displayStatus}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{paymentLabel}</p>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Customer: <span className="text-foreground/90">{customerDisplay}</span>
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 sm:text-sm">
                                <div>
                                  <p className="text-muted-foreground">Service price</p>
                                  <p className="font-semibold tabular-nums">{formatCurrency(totalP)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Customer paid</p>
                                  <p className="font-semibold tabular-nums">{formatCurrency(customerPaid)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Customer remaining</p>
                                  <p className="font-semibold tabular-nums">{formatCurrency(customerRemaining)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Provider share recorded</p>
                                  <p className="font-semibold tabular-nums text-primary">
                                    {formatCurrency(shareRecorded)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Provider share remaining</p>
                                  <p className="font-semibold tabular-nums">{formatCurrency(shareRemaining)}</p>
                                </div>
                                {hasRefund && clawback > 0 ? (
                                  <div>
                                    <p className="text-muted-foreground">Taken back (refund)</p>
                                    <p className="font-semibold tabular-nums text-destructive">
                                      −{formatCurrency(clawback)}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                              {showRefund && (
                                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5">
                                  <RefundSummaryLine
                                    refundAmount={job.refundAmount}
                                    refundStatus={job.refundStatus}
                                    variant="stacked"
                                    className="text-xs"
                                  />
                                  {escrowReversed > 0 && clawback === 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Held funds returned to customer — not settled to you.
                                    </p>
                                  )}
                                </div>
                              )}
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
                      <p className="mt-1 text-sm text-muted-foreground">
                        Customer payment vs your provider share (separate concepts)
                      </p>
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
                      <p className="text-xs font-medium uppercase tracking-wide text-accent">Customer payment</p>
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Name</dt>
                          <dd className="text-right font-medium">
                            {mergedPanelJob.customerName?.trim() || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Service price</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(panelCustomerGross)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Customer paid</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(getJobCustomerPaid(mergedPanelJob))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Customer remaining</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(getJobCustomerRemaining(mergedPanelJob))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Payment status</dt>
                          <dd className="text-right font-medium">
                            {mergedPanelJob.paymentLabel || derivedDetailStatus}
                          </dd>
                        </div>
                      </dl>
                      <p className="pt-2 text-xs font-medium uppercase tracking-wide text-accent">Provider share</p>
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Platform fee (7%)</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(panelCommission || 0)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Share recorded</dt>
                          <dd className="text-right font-semibold tabular-nums text-primary">
                            {formatCurrency(getJobProviderShareRecorded(mergedPanelJob))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Share remaining (unpaid stages)</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {formatCurrency(getJobProviderShareRemaining(mergedPanelJob))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Expected total share</dt>
                          <dd className="text-right font-semibold tabular-nums text-foreground">
                            {formatCurrency(panelProviderNet)}
                          </dd>
                        </div>
                      </dl>
                      {(hasLegacyJobs || panelRemaining > 0 || panelReleased > 0) && (
                        <>
                      <p className="pt-2 text-xs font-medium uppercase tracking-wide text-accent">
                        Legacy settlement (escrow jobs only)
                      </p>
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Settled / recorded to you</dt>
                          <dd className="text-right font-semibold tabular-nums text-primary">
                            {formatCurrency(panelReleased)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Remaining settlement</dt>
                          <dd className="text-right font-semibold tabular-nums">{formatCurrency(panelRemaining)}</dd>
                        </div>
                      </dl>
                        </>
                      )}
                      {panelHasRefund ? (
                        <dl className="space-y-3 border-b border-primary/30 pb-2">
                          {hasRefundDisplay(mergedPanelJob) ? (
                            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                              <RefundSummaryLine
                                refundAmount={mergedPanelJob.refundAmount}
                                refundStatus={mergedPanelJob.refundStatus}
                              />
                            </div>
                          ) : null}
                          {panelClawback > 0 ? (
                            <div className="flex justify-between gap-4">
                              <dt className="text-muted-foreground">Taken back from your balance</dt>
                              <dd className="text-right font-semibold tabular-nums text-destructive">
                                −{formatCurrency(panelClawback)}
                              </dd>
                            </div>
                          ) : null}
                          {panelEscrowReversed > 0 ? (
                            <div className="flex justify-between gap-4">
                              <dt className="text-muted-foreground">Settlement reversed (not paid out)</dt>
                              <dd className="text-right font-semibold tabular-nums text-destructive">
                                −{formatCurrency(panelEscrowReversed)}
                              </dd>
                            </div>
                          ) : null}
                          {panelRefundDebt > 0 ? (
                            <div className="flex justify-between gap-4">
                              <dt className="text-muted-foreground">Outstanding refund debt</dt>
                              <dd className="text-right font-semibold tabular-nums text-destructive">
                                {formatCurrency(panelRefundDebt)}
                              </dd>
                            </div>
                          ) : null}
                          <div className="flex justify-between gap-4 border-t border-border pt-2">
                            <dt className="font-medium text-foreground">Net you kept from this job</dt>
                            <dd className="text-right font-semibold tabular-nums">
                              {formatCurrency(panelNetReleased)}
                            </dd>
                          </div>
                        </dl>
                      ) : null}
                      <dl className="space-y-3 border-b border-primary/30 pb-2">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Job status</dt>
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
                          <span>Provider share progress</span>
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

          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="card-elevated overflow-hidden">
              <div className="border-b border-border p-4 sm:p-6">
                <h2 className="text-lg font-semibold">Payment settlement records</h2>
              </div>
              <div className="p-4 sm:p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <ProviderSettlementJobGroups
                    groups={settlementGroups}
                    variant="history"
                    emptyMessage="No payment records yet."
                  />
                )}
              </div>
            </div>
            {(transactions.length > 0 || transactionsLoading) && (
            <div className="card-elevated overflow-hidden">
              <div className="border-b border-border p-4 sm:p-6">
                <h2 className="text-lg font-semibold">Adjustments</h2>
              </div>
              {transactionsLoading ? (
                <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : (
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
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
