import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getJobsByUser } from '@/lib/api/jobs';
import { listDisputes } from '@/lib/api/disputes';
import { formatRequestedResolution } from '@/lib/disputeLabels';
import { queryKeys } from '@/lib/queryKeys';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import {
  RefundSummaryLine,
  hasRefundDisplay,
  isJobRefunded,
} from '@/components/payments/RefundSummaryLine';
import { Job, JobDispute, JobStatus } from '@/types';
import { Search, Briefcase, ArrowRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupJobsForList } from '@/lib/jobListGrouping';
import { JobListGroup, JobListRowVariant } from '@/components/jobs/JobListGroup';
import { getJobDisplayStatusLabel, getUserJobBadgeClassForJob } from '@/lib/jobProgressDisplay';
import { isActiveWorkflowStatus } from '@/lib/jobStatusMapping';
import { useToast } from '@/hooks/use-toast';
import { useJobActivityIndicators } from '@/hooks/useJobActivityIndicators';
import { ActivityDot } from '@/components/ui/ActivityDot';
import { activeTabHasActivity } from '@/lib/jobActivityIndicators';

type JobsView = 'jobs' | 'review';

function isCancellationReview(job: Job): boolean {
  return (
    job.status === 'DISPUTED' &&
    (job.cancellationSource === 'customer_cancel' || job.cancellationSource === 'provider_cancel')
  );
}

export default function UserJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const jobsView: JobsView = viewParam === 'review' || viewParam === 'disputes' ? 'review' : 'jobs';
  const userId = user?.id ?? '';
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'completed' | 'cancelled'>('all');
  const [disputes, setDisputes] = useState<JobDispute[]>([]);
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
  const activeFilterHasDot = activeTabHasActivity(notifications, jobs, (s) =>
    s ? isActiveWorkflowStatus(s as JobStatus) : false
  );

  useEffect(() => {
    void listDisputes()
      .then((data) => setDisputes(data.disputes))
      .catch(() => setDisputes([]));
  }, []);

  useEffect(() => {
    if (viewParam !== 'disputes') return;
    const next = new URLSearchParams(searchParams);
    next.set('view', 'review');
    setSearchParams(next, { replace: true });
  }, [viewParam, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isError || !loadError) return;
    toast({
      title: 'Could not load jobs',
      description: loadError,
      variant: 'destructive',
    });
  }, [isError, loadError, toast]);

  const disputeByJobId = useMemo(() => {
    const map = new Map<string, JobDispute>();
    disputes.forEach((d) => map.set(d.jobId, d));
    return map;
  }, [disputes]);

  const disputedCount = useMemo(
    () => jobs.filter((job) => job.status === 'DISPUTED').length,
    [jobs]
  );

  const searchFilteredJobs = useMemo(
    () =>
      jobs
        .filter((job) => {
          const q = searchQuery.toLowerCase();
          return (
            job.description.toLowerCase().includes(q) ||
            job.categoryName.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [jobs, searchQuery]
  );

  const viewJobs = useMemo(() => {
    if (jobsView === 'review') {
      return searchFilteredJobs.filter((job) => job.status === 'DISPUTED');
    }
    return searchFilteredJobs.filter((job) => {
      if (job.status === 'DISPUTED') return false;
      return (
        statusFilter === 'all' ||
        (statusFilter === 'pending' && job.status === 'PENDING') ||
        (statusFilter === 'active' && isActiveWorkflowStatus(job.status)) ||
        (statusFilter === 'completed' && job.status === 'COMPLETED') ||
        (statusFilter === 'cancelled' && job.status === 'CANCELLED')
      );
    });
  }, [searchFilteredJobs, jobsView, statusFilter]);

  const setJobsView = (view: JobsView) => {
    if (view === 'jobs') {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    } else {
      const next = new URLSearchParams(searchParams);
      next.set('view', 'review');
      setSearchParams(next, { replace: true });
    }
  };

  const getStatusBadge = (job: Job) => (
    <span className={cn('status-badge', getUserJobBadgeClassForJob(job))}>
      {jobsView === 'review' && isCancellationReview(job) ? 'Cancellation' : getJobDisplayStatusLabel(job)}
    </span>
  );

  const groupedEntries = groupJobsForList(viewJobs);

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
          const { text, isPaid, refundAmount, refundStatus, underAdminReview } = getJobPriceDisplay(job);
          const showRefund = hasRefundDisplay({ refundAmount, refundStatus });
          const processedRefund = isJobRefunded({ refundAmount, refundStatus });
          return (
            <>
              <p className="font-medium">
                {text}
                {isPaid && !processedRefund && <span className="ml-1 text-xs text-success">(Paid)</span>}
                {isPaid && processedRefund && (
                  <span className="ml-1 text-xs text-destructive">(Refunded)</span>
                )}
              </p>
              {underAdminReview && (
                <p className="text-xs text-amber-700 dark:text-amber-200">Under admin review</p>
              )}
              {showRefund && (
                <p className="text-xs">
                  <RefundSummaryLine
                    refundAmount={refundAmount}
                    refundStatus={refundStatus}
                    variant="inline"
                  />
                </p>
              )}
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

  const renderDisputeNote = (job: Job) => {
    const dispute = disputeByJobId.get(job.id);
    if (!dispute) return null;
    const cancellation = isCancellationReview(job);
    return (
      <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm min-w-0">
              <p className="font-medium text-destructive">
                {cancellation ? 'Cancellation in progress' : 'Dispute in progress'}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {dispute.status} ·{' '}
                {formatRequestedResolution(dispute.requestedResolution, dispute.otherResolutionDetail)}
              </p>
              <p className="text-muted-foreground line-clamp-2 mt-1">{dispute.customerComment}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              navigate(cancellation ? `/user/cancellations/${dispute.id}` : `/user/disputes/${dispute.id}`);
            }}
          >
            View case
          </Button>
        </div>
      </div>
    );
  };

  const disputedRowClass =
    jobsView === 'review' ? 'border-l-4 border-destructive bg-destructive/5' : undefined;

  const renderEntry = (entry: ReturnType<typeof groupJobsForList>[number]) => {
    const key = entry.kind === 'group' ? entry.parent.id : entry.job.id;
    const primaryJob = entry.kind === 'group' ? entry.parent : entry.job;

    if (jobsView === 'review') {
      return (
        <div key={key}>
          <JobListGroup
            entry={entry}
            className={disputedRowClass}
            onJobClick={(job) => navigate(`/user/jobs/${job.id}`)}
            renderRow={renderJobRow}
          />
          {renderDisputeNote(primaryJob)}
        </div>
      );
    }

    return (
      <div key={key} className="card-elevated overflow-hidden transition-shadow hover:shadow-lg">
        <JobListGroup
          entry={entry}
          onJobClick={(job) => navigate(`/user/jobs/${job.id}`)}
          renderRow={renderJobRow}
        />
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">My Jobs</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Track service requests and cases under review
            </p>
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
          {jobsView === 'jobs' && (
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
          )}
        </div>

        <div className="space-y-2">
          <Tabs value={jobsView} onValueChange={(v) => setJobsView(v as JobsView)}>
            <TabsList>
              <TabsTrigger value="jobs">My Jobs</TabsTrigger>
              <TabsTrigger value="review" className="gap-2">
                Review Center
                {disputedCount > 0 && (
                  <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                    {disputedCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* {jobsView === 'review' && (
            <p className="text-sm text-muted-foreground">
              Jobs you flagged as not complete stay here until EloFix resolves the case.
            </p>
          )} */}

        {/* Jobs List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card-elevated p-6 animate-pulse">
                <div className="h-6 w-48 bg-muted rounded mb-4" />
                <div className="h-4 w-full bg-muted rounded mb-2" />
                <div className="h-4 w-2/3 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="card-elevated p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="font-semibold mb-2">Failed to load jobs</h3>
            <p className="text-muted-foreground text-sm mb-4">{loadError}</p>
            <Button onClick={() => void refetch()} variant="outline">
              Retry
            </Button>
          </div>
        ) : viewJobs.length > 0 ? (
          jobsView === 'review' ? (
            <div className="card-elevated w-full min-w-0 max-w-full overflow-hidden">
              <div className="divide-y divide-border">
                {groupedEntries.map((entry) => renderEntry(entry))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">{groupedEntries.map((entry) => renderEntry(entry))}</div>
          )
        ) : (
          <div className="card-elevated p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">
              {jobsView === 'review' ? 'No cases under review' : 'No jobs found'}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {jobsView === 'review'
                ? 'Jobs that are cancelled or disputed will appear here while EloFix reviews the case.'
                : searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No jobs available'}
            </p>
            {jobsView === 'jobs' && !searchQuery && statusFilter === 'all' && (
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
