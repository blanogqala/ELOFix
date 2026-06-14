import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getJobsByUser } from '@/lib/api/jobs';
import { queryKeys } from '@/lib/queryKeys';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import { Job } from '@/types';
import { Search, Briefcase, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupJobsForList } from '@/lib/jobListGrouping';
import { JobListGroup, JobListRowVariant } from '@/components/jobs/JobListGroup';
import { getJobDisplayStatusLabel, getUserJobBadgeClassForJob } from '@/lib/jobProgressDisplay';
import { isActiveWorkflowStatus } from '@/lib/jobStatusMapping';
import { useToast } from '@/hooks/use-toast';
import { useJobActivityIndicators } from '@/hooks/useJobActivityIndicators';
import { ActivityDot } from '@/components/ui/ActivityDot';
import { activeTabHasActivity } from '@/lib/jobActivityIndicators';

export default function UserJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? '';
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'completed' | 'cancelled'>('all');
  const {
    data: jobs = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.jobs.byUser(userId),
    queryFn: () => getJobsByUser(userId),
    enabled: Boolean(userId),
  });
  const loadError = isError ? (error instanceof Error ? error.message : 'Failed to load jobs.') : null;
  const { jobHasActivity, notifications } = useJobActivityIndicators();
  const activeFilterHasDot = activeTabHasActivity(notifications, jobs, (s) => isActiveWorkflowStatus(s));

  useEffect(() => {
    if (!isError || !loadError) return;
    toast({
      title: 'Could not load jobs',
      description: loadError,
      variant: 'destructive',
    });
  }, [isError, loadError, toast]);

  const filteredJobs = jobs
    .filter(job => {
      const matchesSearch = job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           job.categoryName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'pending' && job.status === 'PENDING') ||
        (statusFilter === 'active' && isActiveWorkflowStatus(job.status)) ||
        (statusFilter === 'completed' && job.status === 'COMPLETED') ||
        (statusFilter === 'cancelled' && job.status === 'CANCELLED');
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getStatusBadge = (job: Job) => (
    <span className={cn('status-badge', getUserJobBadgeClassForJob(job))}>
      {getJobDisplayStatusLabel(job)}
    </span>
  );

  const groupedEntries = groupJobsForList(filteredJobs);

  const renderJobRow = (job: Job, variant: JobListRowVariant) => (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className={cn('font-medium', variant === 'child' && 'text-sm')}>
            {variant === 'child' ? 'Material delivery' : job.categoryName}
          </p>
          {getStatusBadge(job)}
        </div>
        <p className="text-sm text-muted-foreground truncate">{job.description}</p>
        {variant === 'parent' && job.providerName && (
          <p className="text-xs text-muted-foreground mt-1">Provider: {job.providerName}</p>
        )}
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        {(() => {
          const { text, isPaid } = getJobPriceDisplay(job);
          return (
            <>
              <p className="font-medium">
                {text}
                {isPaid && <span className="ml-1 text-xs text-success">(Paid)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(job.createdAt).toLocaleDateString()}
              </p>
            </>
          );
        })()}
      </div>
      {jobHasActivity(job.id) && (
        <ActivityDot className="shrink-0" aria-label="This job needs your attention" />
      )}
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">My Jobs</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Track and manage your service requests</p>
          </div>
          <Button className="btn-accent h-10 w-full shrink-0 whitespace-nowrap sm:w-auto" onClick={() => navigate('/user/new-request')}>
            New Request
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by category or description"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 h-11 rounded-lg border border-input focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'active', 'completed', 'cancelled'] as const).map((filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? 'default' : 'outline'}
                size="sm"
                className="relative whitespace-nowrap gap-1.5"
                onClick={() => setStatusFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                {filter === 'active' && activeFilterHasDot && (
                  <ActivityDot aria-label="Active jobs need attention" />
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Jobs List */}
        <div className="card-elevated w-full min-w-0 max-w-full overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Briefcase className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="font-semibold mb-2">Failed to load jobs</h3>
              <p className="text-muted-foreground text-sm mb-4">{loadError}</p>
              <Button onClick={() => void refetch()} variant="outline">
                Retry
              </Button>
            </div>
          ) : filteredJobs.length > 0 ? (
            <div className="divide-y divide-border">
              {groupedEntries.map((entry) => (
                <JobListGroup
                  key={entry.kind === 'group' ? entry.parent.id : entry.job.id}
                  entry={entry}
                  onJobClick={(job) => navigate(`/user/jobs/${job.id}`)}
                  renderRow={renderJobRow}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Briefcase className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No jobs found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No jobs available'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <Button onClick={() => navigate('/user/new-request')}>
                  Create Request
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
