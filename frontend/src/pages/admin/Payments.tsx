import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getJobs } from '@/lib/api/jobs';
import { getAdminCommissions } from '@/lib/api/admin';
import { Job } from '@/types';
import { DollarSign, Clock, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getAdminEscrowV2Breakdown } from '@/lib/adminJobFinancial';
import { safeMoney } from '@/lib/jobMoney';

function rowFinancials(job: Job) {
  const fin = getAdminEscrowV2Breakdown(job);
  return {
    totalPrice: fin.totalPrice > 0 ? fin.totalPrice : safeMoney(job.servicePrice?.amount) || safeMoney(job.totalEstimateRange?.min),
    commission: fin.commission,
    provider: fin.provider,
    released: fin.released,
    remaining: fin.remaining,
  };
}

export default function AdminPayments() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCommissionEarned, setTotalCommissionEarned] = useState(0);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const allJobs = await getJobs();
      setJobs(allJobs);
      try {
        const end = new Date();
        const toStr = (d: Date) => d.toISOString().slice(0, 10);
        const comm = await getAdminCommissions({ from: '2000-01-01', to: toStr(end) });
        const v = comm?.totalCommission;
        setTotalCommissionEarned(typeof v === 'number' && Number.isFinite(v) ? v : 0);
      } catch {
        setTotalCommissionEarned(0);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const jobsWithEscrow = jobs.filter((j) => j.escrow.enabled);
  /** Sum of each job's provider share (93% of labor = total price minus platform commission). */
  const totalProviderShare = jobs.reduce((sum, j) => sum + safeMoney(j.providerAmount), 0);
  const totalReleasedToProviders = jobs.reduce((sum, j) => sum + safeMoney(j.releasedAmount), 0);

  const getPaymentStatus = (job: Job) => {
    if (job.status === 'COMPLETED') return { label: 'Released', class: 'text-success' };
    if (job.escrow.enabled && job.escrow.heldAmount > 0) return { label: 'Held', class: 'text-warning' };
    return { label: 'Pending', class: 'text-muted-foreground' };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Payments Overview</h1>
          <p className="text-muted-foreground">Monitor escrow and payment transactions (ZAR)</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
         <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{jobsWithEscrow.length}</p>
                <p className="text-sm text-muted-foreground">Active Jobs</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalProviderShare)}</p>
                <p className="text-sm font-medium text-foreground">Total provider share</p>

              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalReleasedToProviders)}</p>
                <p className="text-sm text-muted-foreground">Released to providers</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalCommissionEarned)}</p>
                <p className="text-sm text-muted-foreground">Total commission earned</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="card-elevated overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="font-semibold">Recent Transactions</h3>
            <p className="text-xs text-muted-foreground mt-1">Amounts from job records after labor settlement.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-4 py-3 text-left">Job</th>
                  <th className="table-header px-4 py-3 text-left">Customer</th>
                  <th className="table-header px-4 py-3 text-left">Provider</th>
                  <th className="table-header px-4 py-3 text-right">Total price</th>
                  <th className="table-header px-4 py-3 text-right">Commission (7%)</th>
                  <th className="table-header px-4 py-3 text-right">Provider (93%)</th>
                  <th className="table-header px-4 py-3 text-right">Released</th>
                  <th className="table-header px-4 py-3 text-right">Remaining</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="px-4 py-4">
                        <div className="animate-pulse h-4 bg-muted rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : jobs.length > 0 ? (
                  jobs.map((job) => {
                    const paymentStatus = getPaymentStatus(job);
                    const f = rowFinancials(job);
                    return (
                      <tr
                        key={job.id}
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/payments/${job.id}`)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{job.categoryName}</p>
                          <p className="text-xs text-muted-foreground">#{job.id.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-[140px] truncate">{job.userName}</td>
                        <td className="px-4 py-3 text-sm max-w-[140px] truncate">{job.providerName || '—'}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">
                          {formatCurrency(f.totalPrice)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(f.commission)}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(f.provider)}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums text-primary">
                          {formatCurrency(f.released)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(f.remaining)}</td>
                        <td className={cn('px-4 py-3 text-sm font-medium', paymentStatus.class)}>
                          {paymentStatus.label}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <p className="text-muted-foreground">No transactions yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
