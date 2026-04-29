import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { getJobs } from '@/lib/api/jobs';
import { getAdminCommissions, getAdminPlatformMaterialOrders } from '@/lib/api/admin';
import { getAdminProviders, getPendingProviders } from '@/lib/api/providers';
import { Job, Provider } from '@/types';
import { 
  Users, 
  Briefcase, 
  CheckCircle, 
  Clock,
  DollarSign,
  ArrowRight,
  AlertCircle,
  UserCheck,
  CreditCard,
  Activity,
  BarChart3,
  Wallet,
  ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getStandardizedStatusLabel, getUserStatusBadgeClass, isActiveWorkflowStatus } from '@/lib/jobStatusMapping';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pendingProviders, setPendingProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminDataError, setAdminDataError] = useState<string | null>(null);
  const [totalCommissionEarned, setTotalCommissionEarned] = useState(0);
  /** Persisted supplier material orders (store + job pipeline) — see GET /admin/material-orders */
  const [materialPipeline, setMaterialPipeline] = useState<{
    orderCount: number;
    totalMaterialsRevenue: number;
    platformCommissionTotal: number;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setAdminDataError(null);
      const toStr = (d: Date) => d.toISOString().slice(0, 10);
      const end = new Date();
      const [allJobs, allProviders, pending] = await Promise.all([
        getJobs(),
        getAdminProviders(),
        getPendingProviders(),
      ]);
      setJobs(allJobs);
      setProviders(allProviders);
      setPendingProviders(pending);
      try {
        const comm = await getAdminCommissions({ from: '2000-01-01', to: toStr(end) });
        const v = comm?.totalCommission;
        setTotalCommissionEarned(typeof v === 'number' && Number.isFinite(v) ? v : 0);
      } catch {
        setTotalCommissionEarned(0);
      }
      try {
        const mo = await getAdminPlatformMaterialOrders(500);
        const s = mo?.summary;
        if (s && typeof s.orderCount === 'number') {
          setMaterialPipeline({
            orderCount: s.orderCount,
            totalMaterialsRevenue: Number(s.totalMaterialsRevenue) || 0,
            platformCommissionTotal: Number(s.platformCommissionTotal) || 0,
          });
        } else {
          setMaterialPipeline(null);
        }
      } catch {
        setMaterialPipeline(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('not implemented')) {
        setAdminDataError('Admin data not yet connected');
      } else {
        setAdminDataError(message || 'Failed to load admin data.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stats = {
    totalJobs: jobs.length,
    pendingJobs: jobs.filter(j => j.status === 'PENDING').length,
    activeJobs: jobs.filter(j => isActiveWorkflowStatus(j.status)).length,
    completedJobs: jobs.filter(j => j.status === 'COMPLETED').length,
    totalProviders: providers.length,
    pendingProviders: pendingProviders.length,
    totalRevenue: jobs.filter(j => j.status === 'COMPLETED').reduce((sum, j) => sum + j.totalEstimateRange.min, 0),
    totalCommissionEarned,
  };

  const getStatusBadge = (status: Job['status']) => (
    <span className={cn('status-badge', getUserStatusBadgeClass(status))}>
      {getStandardizedStatusLabel(status)}
    </span>
  );

  // Build recent activity feed from jobs
  const recentActivity = [
    ...jobs.slice(0, 3).map(j => ({
      id: `job-${j.id}`,
      icon: Briefcase,
      title: `Job created: ${j.categoryName}`,
      description: `By ${j.userName}`,
      time: new Date(j.createdAt).toLocaleDateString(),
      color: 'text-primary',
    })),
    ...providers.filter(p => p.approved).slice(0, 2).map(p => ({
      id: `prov-${p.id}`,
      icon: UserCheck,
      title: `Provider approved: ${p.name}`,
      description: p.skills.slice(0, 2).join(', '),
      time: new Date(p.createdAt).toLocaleDateString(),
      color: 'text-success',
    })),
    ...jobs.filter(j => j.status === 'COMPLETED').slice(0, 2).map(j => ({
      id: `pay-${j.id}`,
      icon: CreditCard,
      title: `Payment completed: ${formatCurrency(j.totalEstimateRange.min)}`,
      description: `${j.categoryName} — ${j.userName}`,
      time: new Date(j.updatedAt).toLocaleDateString(),
      color: 'text-accent',
    })),
  ].slice(0, 6);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of platform activity</p>
        </div>

        {adminDataError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {adminDataError}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalJobs}</p>
                <p className="text-sm text-muted-foreground">Total Jobs</p>
              </div>
            </div>
          </div>
          
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingJobs}</p>
                <p className="text-sm text-muted-foreground">Pending Jobs</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pendingProviders}</p>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
              </div>
            </div>
          </div>
          
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalCommissionEarned)}</p>
                <p className="text-sm text-muted-foreground">Total commission earned</p>
              </div>
            </div>
          </div>
        </div>

        {materialPipeline && (
          <div className="card-elevated p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Material orders (database)</h2>
                  <p className="text-sm text-muted-foreground">
                    All paid supplier orders; platform commission is 7% of materials line (see each order breakdown).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm sm:text-right">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Orders</p>
                  <p className="text-lg font-semibold tabular-nums">{materialPipeline.orderCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Materials revenue</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCurrency(materialPipeline.totalMaterialsRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Platform (7%)</p>
                  <p className="text-lg font-semibold tabular-nums text-accent">
                    {formatCurrency(materialPipeline.platformCommissionTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending Approvals Alert */}
        {pendingProviders.length > 0 && (
          <div className="bg-accent/40 border border-accent rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-warning" />
                <div>
                  <p className="font-medium">{pendingProviders.length} providers awaiting approval</p>
                  <p className="text-sm text-muted-foreground">Review their documents and profiles</p>
                </div>
              </div>
              <Button onClick={() => navigate('/admin/providers')}>
                Review Now
              </Button>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Jobs */}
          <div className="card-elevated">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold">Recent Jobs</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/jobs')}>
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-24 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {[...jobs]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 5)
                  .map((job) => (
                  <div 
                    key={job.id} 
                    className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/jobs/${job.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Briefcase className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{job.categoryName}</p>
                          {getStatusBadge(job.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">{job.userName}</p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(job.totalEstimateRange.min)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="card-elevated">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold">Recent Activity</h2>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4">
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 bg-muted rounded" />
                      <div className="h-3 w-24 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length > 0 ? (
              <div className="divide-y divide-border">
                {recentActivity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.id} className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-8 w-8 rounded-full bg-muted flex items-center justify-center", item.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/admin/analytics')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">View Analytics</p>
                <p className="text-sm text-muted-foreground">Jobs, revenue, and providers</p>
              </div>
            </div>
          </div>
          <div 
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/admin/providers')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Manage Providers</p>
                <p className="text-sm text-muted-foreground">Approve and review providers</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/admin/jobs')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium">View Jobs</p>
                <p className="text-sm text-muted-foreground">Monitor all platform jobs</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/admin/payments')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium">Payments</p>
                <p className="text-sm text-muted-foreground">Review escrow and transactions</p>
              </div>
            </div>
          </div>

          <div
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/admin/withdrawals')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="font-medium">Withdrawals</p>
                <p className="text-sm text-muted-foreground">Approve and mark provider payouts</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
