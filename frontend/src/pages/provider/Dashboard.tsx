import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { JobCardSkeleton } from '@/components/common/loading';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { getJobsByProvider, getPendingRequestsForProvider } from '@/lib/api/jobs';
import { getProviderById } from '@/lib/api/providers';
import { queryKeys } from '@/lib/queryKeys';
import { Job } from '@/types';
import { 
  ClipboardList, Briefcase, CheckCircle, Clock,
  Star, ArrowRight, AlertCircle, MapPin, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getJobDisplayStatusLabel, getUserJobBadgeClassForJob } from '@/lib/jobProgressDisplay';
import { isActiveWorkflowStatus } from '@/lib/jobStatusMapping';
import { getProviderJobPriceDisplay } from '@/lib/jobUtils';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { groupJobsForList } from '@/lib/jobListGrouping';
import { JobListGroup, JobListRowVariant } from '@/components/jobs/JobListGroup';
import { ProviderTrustScoreCard } from '@/components/provider/ProviderTrustScoreCard';
import { useProviderStatus } from '@/hooks/useProviderStatus';

export default function ProviderDashboard() {
  const { user } = useAuth();
  const { isBlocked: isBlockedFromAuth } = useProviderStatus();
  const navigate = useNavigate();
  const userId = user?.id ?? '';

  const {
    data: provider = null,
    isLoading: loadingProvider,
    isError: providerError,
    error: providerErr,
  } = useQuery({
    queryKey: ['provider', 'profile', userId],
    queryFn: () => getProviderById(userId),
    enabled: Boolean(userId),
  });

  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: queryKeys.jobs.byProvider(userId),
    queryFn: () => getJobsByProvider(userId),
    enabled: Boolean(userId),
  });

  const { data: pendingJobs = [], isLoading: loadingPending } = useQuery({
    queryKey: queryKeys.jobs.pendingForProvider(userId),
    queryFn: () => getPendingRequestsForProvider(userId),
    enabled: Boolean(userId),
  });

  const isBlocked = isBlockedFromAuth || Boolean(provider?.blocked);
  const providerLoaded = !loadingProvider && Boolean(provider);
  const showPendingApproval = providerLoaded && !isBlocked && provider?.approved === false;

  const isLoading = loadingProvider || loadingJobs || loadingPending;
  const loadError = providerError
    ? providerErr instanceof Error
      ? providerErr.message
      : 'Failed to load provider dashboard data.'
    : null;

  const stats = {
    pending: pendingJobs.length,
    active: jobs.filter((j) => isActiveWorkflowStatus(j.status) && j.status !== 'DISPUTED').length,
    completed: jobs.filter((j) => j.status === 'COMPLETED').length,
    disputed: jobs.filter((j) => j.status === 'DISPUTED').length,
  };

  const getStatusBadge = (job: Job) => (
    <span className={cn('status-badge', getUserJobBadgeClassForJob(job))}>
      {getJobDisplayStatusLabel(job)}
    </span>
  );

  const recentJobs = [...jobs]
    .filter(j => isActiveWorkflowStatus(j.status) || j.status === 'COMPLETED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const groupedRecentJobs = groupJobsForList(recentJobs).slice(0, 3);

  const renderJobRow = (job: Job, variant: JobListRowVariant) => (
    <>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-medium', variant === 'child' && 'text-muted-foreground')}>
            {variant === 'child' ? 'Material delivery' : job.categoryName}
          </p>
          {getStatusBadge(job)}
        </div>
        <p className="text-xs text-muted-foreground">
          {variant === 'child' ? job.description : job.userName}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums">
          {getProviderJobPriceDisplay(job).text}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(job.createdAt).toLocaleDateString()}
        </p>
      </div>
    </>
  );

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Provider Dashboard</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Manage your service requests and jobs</p>
          </div>
          {isBlocked ? (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Profile Blocked</span>
            </div>
          ) : showPendingApproval ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Pending Approval</span>
            </div>
          ) : null}
        </div>

        {/* Approval Alert */}
        {showPendingApproval && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 sm:h-12 sm:w-12">
                <CheckCircle className="h-4 w-4 text-success sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{stats.completed}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Completed</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                <Clock className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{stats.active}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Active</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
                <ClipboardList className="h-4 w-4 text-warning sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{stats.pending}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending</p>
              </div>
            </div>
          </div>
          <div
            className="card-elevated cursor-pointer p-4 transition-colors hover:border-destructive/30 sm:p-6"
            onClick={() => navigate('/provider/jobs?view=review')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/provider/jobs?view=review');
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 sm:h-12 sm:w-12">
                <AlertCircle className="h-4 w-4 text-destructive sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{stats.disputed}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Under Review</p>
              </div>
            </div>
          </div>
        </div>

        {/* <button
          type="button"
          onClick={() => navigate('/provider/jobs?view=review')}
          className="card-elevated p-4 sm:p-6 w-full text-left hover:shadow-md transition-shadow"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 sm:h-12 sm:w-12">
              <AlertCircle className="h-4 w-4 text-destructive sm:h-5 sm:w-5" />
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-lg font-bold">{disputeStats?.totalFlagged ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total flagged</p>
              </div>
              <div>
                <p className="text-lg font-bold">{disputeStats?.openDisputes ?? 0}</p>
                <p className="text-xs text-muted-foreground">Open disputes</p>
              </div>
              <div>
                <p className="text-lg font-bold">{disputeStats?.resolvedDisputes ?? 0}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
              <div>
                <p className="text-lg font-bold">{disputeStats?.trustScoreImpact ?? 0}</p>
                <p className="text-xs text-muted-foreground">Trust impact</p>
              </div>
            </div>
            <span className="text-sm font-medium text-primary shrink-0">Under Review →</span>
          </div>
        </button> */}

        {/* Provider Profile Card */}
        {provider && (
          <div className="card-elevated bg-accent/30 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-col sm:items-start sm:pl-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                  {resolveUploadUrl(provider.profileImage) ? (
                    <img src={resolveUploadUrl(provider.profileImage)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{provider.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex justify-end sm:justify-end sm:ml-48 sm:mt-4">
                  <Button variant="outline" className="h-9 w-28 shrink-0 whitespace-nowrap sm:w-48" onClick={() => navigate('/provider/profile')}>Edit Profile</Button>
                </div>
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold sm:text-xl">{provider.name}</h3>
                  {isBlocked ? (
                    <span className="inline-block rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                      Blocked
                    </span>
                  ) : null}
                </div>
                <p className="mb-2 text-sm text-muted-foreground">{provider.bio || 'Add a bio to attract more clients'}</p>
                <div className="flex flex-wrap gap-3 text-sm sm:gap-4">
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
              
            </div>
          </div>
        )}

        <ProviderTrustScoreCard />

        {/* Two-Column Grid: Pending Requests + Recent Jobs */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {/* Pending Requests Column */}
          <div className="card-elevated overflow-hidden">
            <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0 col-span-1">
                <h2 className="text-lg font-semibold sm:text-xl">Pending Requests</h2>
                <p className="text-sm text-muted-foreground">{pendingJobs.length} awaiting response</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/provider/requests')}>
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {isLoading ? (
              <div className="p-6">
                <JobCardSkeleton count={3} />
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
                          <img src={resolveUploadUrl(job.images[0])} alt="" className="h-full w-full object-cover" />
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
                        <p className="text-sm font-semibold text-primary tabular-nums">
                          {getProviderJobPriceDisplay(job).text}
                        </p>
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
          <div className="card-elevated overflow-hidden">
            <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0 col-span-1">
                <h2 className="text-lg font-semibold sm:text-xl">Recent Jobs</h2>
                <p className="text-sm text-muted-foreground">{recentJobs.length} jobs</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/provider/jobs')}>
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            {isLoading ? (
              <div className="p-6">
                <JobCardSkeleton count={3} />
              </div>
            ) : groupedRecentJobs.length > 0 ? (
              <div className="divide-y divide-border">
                {groupedRecentJobs.map((entry) => (
                  <JobListGroup
                    key={entry.kind === 'group' ? entry.parent.id : entry.job.id}
                    entry={entry}
                    onJobClick={(job) => navigate(`/provider/jobs/${job.id}`)}
                    renderRow={renderJobRow}
                  />
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
