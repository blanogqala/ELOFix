import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  listAdminWithdrawals,
  approveAdminWithdrawal,
  markAdminWithdrawalPaid,
  markAdminWithdrawalFailed,
  type AdminWithdrawalRow,
} from '@/lib/api/adminWithdrawals';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminWithdrawals() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminWithdrawals();
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
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: string, action: 'approve' | 'paid' | 'failed') => {
    setActingId(id);
    try {
      if (action === 'approve') await approveAdminWithdrawal(id);
      else if (action === 'paid') await markAdminWithdrawalPaid(id);
      else await markAdminWithdrawalFailed(id);
      toast({ title: action === 'failed' ? 'Marked failed' : 'Updated' });
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Withdrawals</h1>
          <p className="text-muted-foreground">Approve provider payouts and mark bank transfers complete</p>
        </div>

        <div className="card-elevated overflow-hidden">
          <div className="p-6 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold">Requests</h3>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 flex justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground">No withdrawal requests</p>
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
                      <td className="px-6 py-4 text-right space-x-2">
                        {w.status === 'pending' && (
                          <Button
                            size="sm"
                            disabled={actingId === w.id}
                            onClick={() => void run(w.id, 'approve')}
                          >
                            Approve
                          </Button>
                        )}
                        {w.status === 'approved' && (
                          <Button
                            size="sm"
                            disabled={actingId === w.id}
                            onClick={() => void run(w.id, 'paid')}
                          >
                            Mark paid
                          </Button>
                        )}
                        {(w.status === 'pending' || w.status === 'approved') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={actingId === w.id}
                            onClick={() => void run(w.id, 'failed')}
                          >
                            Fail
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
