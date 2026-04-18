import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { getJobs } from '@/lib/api/jobs';
import { Job } from '@/types';
import { DollarSign, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

export default function AdminPayments() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const allJobs = await getJobs();
      setJobs(allJobs);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const jobsWithEscrow = jobs.filter(j => j.escrow.enabled);
  const totalHeld = jobsWithEscrow.reduce((sum, j) => sum + j.escrow.heldAmount, 0);
  const totalReleased = jobs.filter(j => j.status === 'COMPLETED').reduce((sum, j) => sum + j.totalEstimateRange.min, 0);

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
          <p className="text-muted-foreground">Monitor escrow and payment transactions</p>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalHeld)}</p>
                <p className="text-sm text-muted-foreground">In Escrow</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalReleased.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Released</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{jobsWithEscrow.length}</p>
                <p className="text-sm text-muted-foreground">Active Escrows</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="card-elevated overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="font-semibold">Recent Transactions</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-6 py-4 text-left">Job</th>
                  <th className="table-header px-6 py-4 text-left">Customer</th>
                  <th className="table-header px-6 py-4 text-left">Provider</th>
                  <th className="table-header px-6 py-4 text-left">Amount</th>
                  <th className="table-header px-6 py-4 text-left">Payment Type</th>
                  <th className="table-header px-6 py-4 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-6 py-4">
                        <div className="animate-pulse h-4 bg-muted rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : jobs.length > 0 ? (
                  jobs.map((job) => {
                    const paymentStatus = getPaymentStatus(job);
                    return (
                      <tr
                        key={job.id}
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/payments/${job.id}`)}
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-sm">{job.categoryName}</p>
                          <p className="text-xs text-muted-foreground">#{job.id.slice(-8)}</p>
                        </td>
                        <td className="px-6 py-4 text-sm">{job.userName}</td>
                        <td className="px-6 py-4 text-sm">{job.providerName || '—'}</td>
                        <td className="px-6 py-4 text-sm font-medium">{formatCurrency(job.totalEstimateRange.min)}</td>
                        <td className="px-6 py-4 text-sm">{job.paymentPlan.type}</td>
                        <td className={cn("px-6 py-4 text-sm font-medium", paymentStatus.class)}>
                          {paymentStatus.label}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
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
