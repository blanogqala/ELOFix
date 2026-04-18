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
      <div className="space-y-6 animate-fade-in p-4">
        <div>
          <h1 className="text-2xl font-bold">Earnings</h1>
          <p className="text-muted-foreground">Track your income and payouts</p>
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">${totalEarned}</p>
                <p className="text-sm text-muted-foreground">Total Earned</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(pendingEarnings)}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedJobs.length}</p>
                <p className="text-sm text-muted-foreground">Completed Jobs</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatCurrency(completedJobs.length > 0 ? Math.round(totalEarned / completedJobs.length) : 0)}
                </p>
                <p className="text-sm text-muted-foreground">Avg per Job</p>
              </div>
            </div>
          </div>
        </div>

        {/* Payout History */}
        <div className="card-elevated">
          <div className="p-6 border-b border-border">
            <h2 className="font-semibold">Payout History</h2>
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
                <div key={job.id} className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5 text-success" />
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
