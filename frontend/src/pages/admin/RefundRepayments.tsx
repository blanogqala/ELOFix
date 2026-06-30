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
  type AdminRefundRepaymentRow,
} from '@/lib/api/adminRefundRepayments';
import { unblockProvider } from '@/lib/api/providers';
import { Loader2, RotateCcw, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 300;

type UnblockPrompt = {
  userId: string;
  name: string;
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

  const runConfirm = async (row: AdminRefundRepaymentRow) => {
    setActingId(row.id);
    try {
      await confirmAdminRefundRepayment(row.id);
      toast({ title: 'Confirmed', description: 'Debt cleared and customer payout staged.' });
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
            Review provider bank transfers toward outstanding refund debt.
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
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{row.provider?.user?.name || 'Provider'}</p>
                      <p className="text-sm text-muted-foreground">{row.provider?.user?.email}</p>
                      <p className="text-sm mt-1">
                        {formatCurrency(row.amount)} · ref:{' '}
                        <span className="font-mono">{row.reference}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Submitted {format(parseISO(row.createdAt), 'PPp')} ·{' '}
                        {repaymentStatusLabel(row.status)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void runConfirm(row)}
                        disabled={actingId === row.id}
                      >
                        {actingId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runReject(row.id)}
                        disabled={actingId === row.id}
                      >
                        Reject
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
                {rows.map((row) => (
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
                      {formatCurrency(row.amount)} · ref:{' '}
                      <span className="font-mono">{row.reference}</span>
                    </p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Submitted {format(parseISO(row.createdAt), 'PPp')}</p>
                      {row.reviewedAt && (
                        <p>Reviewed {format(parseISO(row.reviewedAt), 'PPp')}</p>
                      )}
                      {row.adminNote && (
                        <p className="text-foreground/80">Note: {row.adminNote}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

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
