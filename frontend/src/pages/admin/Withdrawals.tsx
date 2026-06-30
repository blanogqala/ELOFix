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
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  listAdminWithdrawals,
  markAdminWithdrawalFailed,
  type AdminWithdrawalRow,
} from '@/lib/api/adminWithdrawals';
import { Loader2, Search, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 300;

export default function AdminWithdrawals() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminWithdrawals({
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setRows(data.withdrawals || []);
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load withdrawals',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runFail = async (id: string) => {
    setActingId(id);
    try {
      await markAdminWithdrawalFailed(id);
      toast({ title: 'Marked failed', description: 'Funds returned to provider available balance.' });
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

  const statusClass = (s: string) => {
    const v = s.toLowerCase();
    if (v === 'paid') return 'text-success';
    if (v === 'failed') return 'text-destructive';
    if (v === 'approved') return 'text-primary';
    return 'text-muted-foreground';
  };

  const isLegacyOpen = (s: string) => {
    const v = s.toLowerCase();
    return v === 'pending' || v === 'approved';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Withdrawals</h1>
          <p className="text-muted-foreground">
            Monitor provider payout activity. New withdrawals are completed automatically.
          </p>
        </div>

        <Tabs defaultValue="providers" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search provider name or email…"
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending (legacy)</SelectItem>
                    <SelectItem value="approved">Approved (legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                Refresh
              </Button>
            </div>

            <div className="card-elevated overflow-hidden">
              <div className="p-6 border-b border-border">
                <h3 className="font-semibold">Provider withdrawals</h3>
              </div>
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-12 flex justify-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : rows.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">No withdrawal requests match your filters</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="table-header px-6 py-4 text-left">Created</th>
                        <th className="table-header px-6 py-4 text-left">Provider</th>
                        <th className="table-header px-6 py-4 text-left">Amount</th>
                        <th className="table-header px-6 py-4 text-left">Status</th>
                        <th className="table-header px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((w) => (
                        <tr key={w.id} className="border-b border-border">
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {new Date(w.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium">{w.providerName || '—'}</div>
                            <div className="text-xs text-muted-foreground">{w.providerEmail || w.providerId}</div>
                          </td>
                          <td className="px-6 py-4 font-medium">{formatCurrency(w.amount)}</td>
                          <td className={cn('px-6 py-4 capitalize', statusClass(w.status))}>{w.status}</td>
                          <td className="px-6 py-4 text-right">
                            {isLegacyOpen(w.status) ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actingId === w.id}
                                onClick={() => void runFail(w.id)}
                              >
                                {actingId === w.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                {actingId === w.id ? 'Failing…' : 'Fail'}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="suppliers" className="mt-4">
            <div className="card-elevated flex flex-col items-center gap-4 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Truck className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Supplier withdrawals</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Supplier material earnings payouts will be managed here. This feature is coming soon.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
