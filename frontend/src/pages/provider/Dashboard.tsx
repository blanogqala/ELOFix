import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { getJobsByProvider, getPendingRequestsForProvider } from '@/lib/api/jobs';
import { getProviderById } from '@/lib/api/providers';
import { Job, Provider } from '@/types';
import { 
  ClipboardList, Briefcase, CheckCircle, Clock,
  DollarSign, Star, ArrowRight, AlertCircle, MapPin, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStandardizedStatusLabel, getUserStatusBadgeClass, isActiveWorkflowStatus } from '@/lib/jobStatusMapping';

export default function ProviderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoadError(null);
      const [providerData, providerJobs, pending] = await Promise.all([
        getProviderById(user.id),
        getJobsByProvider(user.id),
        getPendingRequestsForProvider(user.id),
      ]);
      setProvider(providerData);
      setJobs(providerJobs);
      setPendingJobs(pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load provider dashboard data.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user, loadData]);

  const stats = {
    pending: pendingJobs.length,
    active: jobs.filter(j => isActiveWorkflowStatus(j.status)).length,
    completed: jobs.filter(j => j.status === 'COMPLETED').length,
    earnings: jobs.filter(j => j.status === 'COMPLETED').reduce((sum, j) => sum + j.laborEstimateRange.min, 0),
  };

  const getStatusBadge = (status: Job['status']) => (
    <span className={cn('status-badge', getUserStatusBadgeClass(status))}>
      {getStandardizedStatusLabel(status)}
    </span>
  );

  const recentJobs = [...jobs]
    .filter(j => isActiveWorkflowStatus(j.status) || j.status === 'COMPLETED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in p-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Provider Dashboard</h1>
            <p className="text-muted-foreground">Manage your service requests and jobs</p>
          </div>
          {!provider?.approved && (
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Pending Approval</span>
            </div>
          )}
        </div>

        {/* Approval Alert */}
        {!provider?.approved && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Complete your profile for approval</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload required documents and set up your pricing to start receiving job requests.
                </p>
                <Button size="sm" onClick={() => navigate('/provider/profile')}>Complete Profile</Button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">R{stats.earnings}</p>
                <p className="text-sm text-muted-foreground">Earnings</p>
              </div>
            </div>
          </div>
        </div>

        {/* Provider Profile Card */}
        {provider && (
          <div className="card-elevated p-6 bg-accent/30">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-primary">{provider.name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg">{provider.name}</h3>
                <p className="text-sm text-muted-foreground mb-2">{provider.bio || 'Add a bio to attract more clients'}</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-accent text-accent" />
                    {provider.rating > 0 ? provider.rating.toFixed(1) : 'No ratings yet'}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    {provider.completedJobs} jobs completed
                  </span>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate('/provider/profile')}>Edit Profile</Button>
            </div>
          </div>
        )}

        {/* Two-Column Grid: Pending Requests + Recent Jobs */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pending Requests Column */}
          <div className="card-elevated">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Pending Requests</h2>
                <p className="text-sm text-muted-foreground">{pendingJobs.length} awaiting response</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/provider/requests')}>
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingJobs.length > 0 ? (
              <div className="divide-y divide-border">
                {pendingJobs.slice(0, 4).map(job => (
                  <div
                    key={job.id}
                    className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/provider/requests/${job.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      {job.images[0] ? (
                        <div className="h-12 w-12 rounded-lg overflow-hidden shrink-0">
                          <img src={job.images[0]} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                          <ClipboardList className="h-6 w-6 text-warning" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{job.categoryName}</p>
                        <p className="text-xs text-muted-foreground truncate">{job.description}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" /> {job.materials.length} items
                          </span>
                          <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-primary">R{job.totalEstimateRange.min}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <ClipboardList className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No pending requests</p>
              </div>
            )}
          </div>

          {/* Recent Jobs Column */}
          <div className="card-elevated">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Recent Jobs</h2>
                <p className="text-sm text-muted-foreground">{recentJobs.length} jobs</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/provider/jobs')}>
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentJobs.length > 0 ? (
              <div className="divide-y divide-border">
                {recentJobs.map(job => (
                  <div
                    key={job.id}
                    className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/provider/jobs/${job.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Briefcase className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-medium text-sm">{job.categoryName}</p>
                          {getStatusBadge(job.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">{job.userName}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-sm">R{job.laborEstimateRange.min}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Briefcase className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No jobs yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
