import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { formatCurrency } from '@/lib/formatCurrency';
import {
  listAdminRefundRepayments,
  confirmAdminRefundRepayment,
  rejectAdminRefundRepayment,
  processAdminCustomerRefund,
  type AdminRefundRepaymentRow,
} from '@/lib/api/adminRefundRepayments';
import { canRetryCustomerRefund, confirmCustomerRefundToast } from '@/lib/adminRefundRepaymentUi';
import { unblockProvider } from '@/lib/api/providers';
import { ExternalLink, Loader2, RotateCcw, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 300;

type UnblockPrompt = {
  userId: string;
  name: string;
};

type ConfirmPrompt = {
  row: AdminRefundRepaymentRow;
  partial: boolean;
};

function repaymentStatusLabel(status: string) {
  if (status === 'SUBMITTED') return 'Awaiting review';
  if (status === 'CONFIRMED') return 'Confirmed';
  if (status === 'REJECTED') return 'Rejected';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function historyOutcomeClass(status: string) {
  if (status === 'CONFIRMED') return 'text-success';
  if (status === 'REJECTED') return 'text-destructive';
  return 'text-muted-foreground';
}

function moneyOrMissing(amount: number | null | undefined, missing?: boolean): string {
  if (missing || amount == null || !Number.isFinite(Number(amount))) {
    return 'Amount unavailable';
  }
  return formatCurrency(Number(amount), { decimals: 2 });
}

function RepaymentVerificationDetails({ row }: { row: AdminRefundRepaymentRow }) {
  const submitted = row.submittedAmount ?? row.amount;
  const expected = row.expectedAmount;
  const mismatch = Boolean(row.amountMismatch);
  const missing = Boolean(row.amountMissing);
  const originalPayments = row.originalCustomerPayments || [];
  const originalTotal = originalPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium text-foreground">Refund payment verification</p>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Provider</dt>
          <dd className="font-medium">{row.provider?.user?.name || 'Provider'}</dd>
          <dd className="text-xs text-muted-foreground">{row.provider?.user?.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Customer</dt>
          <dd className="font-medium">{row.customerName || '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Job</dt>
          <dd className="font-medium">
            {row.jobTitle || (row.jobId ? `Job #${String(row.jobId).slice(-8)}` : '—')}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Refund reason</dt>
          <dd className="font-medium">
            {row.refundReason || 'Administrator dispute resolution — customer refund'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Original customer payment</dt>
          <dd className="font-semibold tabular-nums">
            {originalPayments.length
              ? formatCurrency(originalTotal, { decimals: 2 })
              : '—'}
          </dd>
          {originalPayments[0] ? (
            <dd className="text-xs text-muted-foreground">
              {originalPayments[0].gateway}
              {originalPayments[0].gatewayTransactionId
                ? ` · ${originalPayments[0].gatewayTransactionId}`
                : ''}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Repayment method</dt>
          <dd className="font-medium">{row.method === 'GATEWAY' ? 'Gateway checkout' : 'Bank transfer'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Expected provider repayment</dt>
          <dd className="font-semibold tabular-nums">{moneyOrMissing(expected, missing)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Submitted repayment</dt>
          <dd className="font-semibold tabular-nums">{moneyOrMissing(submitted, missing)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Repayment status</dt>
          <dd>{repaymentStatusLabel(row.status)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Customer refund</dt>
          <dd className="font-medium">{row.customerRefundStatus || '—'}</dd>
        </div>
        {mismatch && !missing ? (
          <div className="sm:col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-900 dark:text-amber-100">
            <p className="font-medium">Amount mismatch</p>
            <p className="text-xs">
              Difference: {formatCurrency(Number(row.difference || 0), { decimals: 2 })}. Confirming
              without acknowledgment is blocked; use Confirm only if you accept a partial recovery.
            </p>
          </div>
        ) : null}
        {missing ? (
          <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-destructive">
            Repayment amount is missing or invalid on the server. Do not confirm until this is
            corrected.
          </div>
        ) : null}
        {row.manualActionReason ? (
          <div className="sm:col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-900 dark:text-amber-100">
            <p className="font-medium">Manual gateway action required</p>
            <p className="text-xs">{row.manualActionReason}</p>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Reference</dt>
          <dd className="font-mono text-xs sm:text-sm">{row.reference}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Submitted</dt>
          <dd>{format(parseISO(row.createdAt), 'PPp')}</dd>
        </div>
        {row.proofUrl ? (
          <div className="sm:col-span-2">
            <a
              href={row.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              View proof of payment <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export default function AdminRefundRepayments() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminRefundRepaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'reviews' | 'history'>('reviews');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [unblockPrompt, setUnblockPrompt] = useState<UnblockPrompt | null>(null);
  const [unblocking, setUnblocking] = useState(false);
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminRefundRepayments({
        view: tab,
        status:
          tab === 'history' && historyStatusFilter !== 'all' ? historyStatusFilter : undefined,
        search: search || undefined,
      });
      setRows(data.repayments || []);
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load repayments',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, tab, historyStatusFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const runConfirm = async (row: AdminRefundRepaymentRow, acknowledgePartial = false) => {
    setActingId(row.id);
    try {
      const res = await confirmAdminRefundRepayment(row.id, {
        acknowledgePartial: acknowledgePartial || undefined,
      });
      const payoutToast = confirmCustomerRefundToast(res.customerRefund?.status);
      toast({
        title: payoutToast.title,
        description: acknowledgePartial
          ? `Partial repayment applied. ${payoutToast.description}`
          : payoutToast.description,
      });
      setConfirmPrompt(null);
      await load();

      const userId = row.provider?.user?.id;
      if (row.provider?.blocked && userId) {
        setUnblockPrompt({
          userId,
          name: row.provider.user?.name || 'Provider',
        });
      }
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  const requestConfirm = (row: AdminRefundRepaymentRow) => {
    if (row.amountMissing) {
      toast({
        title: 'Cannot confirm',
        description: 'Repayment amount is missing or invalid.',
        variant: 'destructive',
      });
      return;
    }
    setConfirmPrompt({ row, partial: Boolean(row.amountMismatch) });
  };

  const runUnblock = async () => {
    if (!unblockPrompt) return;
    setUnblocking(true);
    try {
      await unblockProvider(unblockPrompt.userId);
      toast({
        title: 'Provider unblocked',
        description: `${unblockPrompt.name} can resume working on EloFix.`,
      });
      setUnblockPrompt(null);
      await load();
    } catch (e: unknown) {
      toast({
        title: 'Unblock failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setUnblocking(false);
    }
  };

  const runReject = async (id: string) => {
    setActingId(id);
    try {
      await rejectAdminRefundRepayment(id, { adminNote: 'Payment not verified' });
      toast({ title: 'Rejected', description: 'Provider notified.' });
      await load();
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  const runProcessCustomerRefund = async (id: string) => {
    setActingId(id);
    try {
      const res = await processAdminCustomerRefund(id);
      const statuses = (res.results || []).map((r) => r.status).join(', ') || 'done';
      toast({
        title: 'Customer refund retried',
        description: statuses,
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: 'Could not process customer refund',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  const emptyMessage =
    tab === 'reviews'
      ? 'No repayments awaiting review.'
      : 'No repayment history matches your filters.';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6" />
            Refund repayments
          </h1>
          <p className="text-muted-foreground">
            Confirm that the provider repaid EloFix. Confirmation also sends the customer refund
            against the original payment. Retry from History only if the gateway refund fails.
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search provider name, email, or reference…"
            className="pl-9"
          />
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'reviews' | 'history')}
        >
          <TabsList>
            <TabsTrigger value="reviews">Pending review</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="reviews" className="mt-4 space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground">{emptyMessage}</p>
            ) : (
              <ul className="card-elevated divide-y divide-border overflow-hidden">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <RepaymentVerificationDetails row={row} />
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => requestConfirm(row)}
                        disabled={actingId === row.id || Boolean(row.amountMissing)}
                      >
                        {actingId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Confirm repayment'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runReject(row.id)}
                        disabled={actingId === row.id}
                      >
                        Reject repayment
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-4">
            <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground">{emptyMessage}</p>
            ) : (
              <ul className="card-elevated divide-y divide-border overflow-hidden">
                {rows.map((row) => {
                  const submitted = row.submittedAmount ?? row.amount;
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{row.provider?.user?.name || 'Provider'}</p>
                          <p className="text-sm text-muted-foreground">{row.provider?.user?.email}</p>
                        </div>
                        <span
                          className={cn(
                            'text-sm font-medium capitalize',
                            historyOutcomeClass(row.status)
                          )}
                        >
                          {repaymentStatusLabel(row.status)}
                        </span>
                      </div>
                      <p className="text-sm">
                        Submitted {moneyOrMissing(submitted, row.amountMissing)} · ref:{' '}
                        <span className="font-mono">{row.reference}</span>
                      </p>
                      {row.customerName || row.jobTitle ? (
                        <p className="text-xs text-muted-foreground">
                          {row.customerName ? `Customer: ${row.customerName}` : null}
                          {row.customerName && row.jobTitle ? ' · ' : null}
                          {row.jobTitle ? `Job: ${row.jobTitle}` : null}
                        </p>
                      ) : null}
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Submitted {format(parseISO(row.createdAt), 'PPp')}</p>
                        {row.reviewedAt && (
                          <p>Reviewed {format(parseISO(row.reviewedAt), 'PPp')}</p>
                        )}
                        {row.customerRefundStatus ? (
                          <p>Customer refund: {row.customerRefundStatus}</p>
                        ) : null}
                        {row.adminNote && (
                          <p className="text-foreground/80">Note: {row.adminNote}</p>
                        )}
                      </div>
                      {row.status === 'CONFIRMED' && canRetryCustomerRefund(row.customerRefundStatus) ? (
                        <div className="pt-1">
                          <Button
                            size="sm"
                            onClick={() => void runProcessCustomerRefund(row.id)}
                            disabled={actingId === row.id}
                          >
                            {actingId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Retry customer refund'
                            )}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog
        open={confirmPrompt !== null}
        onOpenChange={(open) => {
          if (!open && !actingId) setConfirmPrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmPrompt?.partial ? 'Confirm partial repayment?' : 'Confirm repayment?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {confirmPrompt?.partial ? (
                  <>
                    <p>
                      Submitted amount does not match the expected obligation. Confirming will apply
                      only the submitted amount toward debt — not a full clearance.
                    </p>
                    <p>
                      Expected:{' '}
                      <span className="font-medium text-foreground">
                        {moneyOrMissing(confirmPrompt.row.expectedAmount)}
                      </span>
                      {' · '}
                      Submitted:{' '}
                      <span className="font-medium text-foreground">
                        {moneyOrMissing(
                          confirmPrompt.row.submittedAmount ?? confirmPrompt.row.amount
                        )}
                      </span>
                    </p>
                  </>
                ) : (
                  <p>
                    Mark this repayment as verified. EloFix will also attempt the customer refund of{' '}
                    <span className="font-medium text-foreground">
                      {moneyOrMissing(
                        confirmPrompt?.row.submittedAmount ?? confirmPrompt?.row.amount
                      )}
                    </span>{' '}
                    against the original payment.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(actingId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(actingId)}
              onClick={(e) => {
                e.preventDefault();
                if (!confirmPrompt) return;
                void runConfirm(confirmPrompt.row, confirmPrompt.partial);
              }}
            >
              {actingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming…
                </>
              ) : confirmPrompt?.partial ? (
                'Confirm partial repayment'
              ) : (
                'Confirm repayment'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={unblockPrompt !== null}
        onOpenChange={(open) => {
          if (!open && !unblocking) setUnblockPrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock provider?</AlertDialogTitle>
            <AlertDialogDescription>
              Repayment confirmed.{' '}
              <span className="font-medium text-foreground">{unblockPrompt?.name}</span> is currently
              blocked. Unblock them now so they can resume working on EloFix?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unblocking}>Keep blocked</AlertDialogCancel>
            <AlertDialogAction
              disabled={unblocking}
              onClick={(e) => {
                e.preventDefault();
                void runUnblock();
              }}
            >
              {unblocking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unblocking…
                </>
              ) : (
                'Unblock provider'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
