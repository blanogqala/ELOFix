import { useCallback, useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getJobsByProvider } from '@/lib/api/jobs';
import { Job } from '@/types';
import { DollarSign, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';

export default function ProviderEarnings() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getJobsByProvider(user.id);
      setJobs(data);
    } catch (error) {
      console.error('Failed to load earnings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user, loadData]);

  const completedJobs = jobs.filter(j => j.status === 'COMPLETED');
  const inProgressJobs = jobs.filter(j => j.status === 'IN_PROGRESS');

  const totalEarned = completedJobs.reduce((sum, j) => sum + j.laborEstimateRange.min, 0);
  const pendingEarnings = inProgressJobs.reduce((sum, j) => sum + j.laborEstimateRange.min, 0);

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Earnings</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Track your income and payouts</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 sm:h-12 sm:w-12">
                <DollarSign className="h-4 w-4 text-success sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">${totalEarned}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Total Earned</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
                <Clock className="h-4 w-4 text-warning sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{formatCurrency(pendingEarnings)}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                <CheckCircle className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{completedJobs.length}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Completed Jobs</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 sm:h-12 sm:w-12">
                <TrendingUp className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">
                  {formatCurrency(completedJobs.length > 0 ? Math.round(totalEarned / completedJobs.length) : 0)}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">Avg per Job</p>
              </div>
            </div>
          </div>
        </div>

        {/* Payout History */}
        <div className="card-elevated overflow-hidden">
          <div className="border-b border-border p-4 sm:p-6">
            <h2 className="text-lg font-semibold sm:text-xl">Payout History</h2>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : completedJobs.length > 0 ? (
            <div className="divide-y divide-border">
              {completedJobs.map(job => (
                <div key={job.id} className="flex min-w-0 items-center gap-3 p-4 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                    <DollarSign className="h-4 w-4 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{job.categoryName} — {job.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      Completed {new Date(job.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="font-semibold text-success">{formatCurrency(job.laborEstimateRange.min)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No earnings yet</h3>
              <p className="text-muted-foreground text-sm">Complete jobs to start earning</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
