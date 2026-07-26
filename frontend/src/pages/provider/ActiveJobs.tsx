import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getJobsByProvider, deleteJob } from '@/lib/api/jobs';
import { listDisputes } from '@/lib/api/disputes';
import { formatRequestedResolution } from '@/lib/disputeLabels';
import { queryKeys } from '@/lib/queryKeys';
import { Job, JobDispute, JobStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Briefcase, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import { getJobDisplayStatusLabel, getProviderJobBadgeVariantForJob } from '@/lib/jobProgressDisplay';
import { getProviderJobPriceDisplay } from '@/lib/jobUtils';
import {
  RefundSummaryLine,
  hasRefundDisplay,
  isJobRefunded,
} from '@/components/payments/RefundSummaryLine';
import { ACTIVE_WORKFLOW_JOB_STATUSES, isActiveWorkflowStatus } from '@/lib/jobStatusMapping';
import { useJobActivityIndicators } from '@/hooks/useJobActivityIndicators';
import { ActivityDot } from '@/components/ui/ActivityDot';
import { activeTabHasActivity } from '@/lib/jobActivityIndicators';
import { groupJobsForList } from '@/lib/jobListGrouping';
import { JobListGroup, JobListRowVariant } from '@/components/jobs/JobListGroup';
import { ProviderRequestCard } from '@/components/jobs/ProviderRequestCard';

type JobsView = 'jobs' | 'review';

function isCancellationReview(job: Job): boolean {
  return (
    job.status === 'DISPUTED' &&
    (job.cancellationSource === 'customer_cancel' || job.cancellationSource === 'provider_cancel')
  );
}

export default function ProviderActiveJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const jobsView: JobsView = viewParam === 'review' || viewParam === 'disputes' ? 'review' : 'jobs';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = user?.id ?? '';
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: queryKeys.jobs.byProvider(userId),
    queryFn: () => getJobsByProvider(userId),
    enabled: Boolean(userId),
  });
  const [filter, setFilter] = useState<string>('all');
  const [disputes, setDisputes] = useState<JobDispute[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
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

  const disputeByJobId = useMemo(() => {
    const map = new Map<string, JobDispute>();
    disputes.forEach((d) => map.set(d.jobId, d));
    return map;
  }, [disputes]);

  const disputedCount = useMemo(
    () => jobs.filter((job) => job.status === 'DISPUTED').length,
    [jobs]
  );

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

  const handleDeleteCancelled = async () => {
    if (!jobToDelete) return;
    try {
      await deleteJob(jobToDelete.id);
      queryClient.removeQueries({ queryKey: queryKeys.jobs.detail(jobToDelete.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      setDeleteDialogOpen(false);
      setJobToDelete(null);
      toast({ title: 'Removed', description: 'Job removed from your list only. Other parties are unaffected.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const getStatusBadge = (job: Job) => (
    <Badge variant={getProviderJobBadgeVariantForJob(job)}>
      {jobsView === 'review' && isCancellationReview(job) ? 'Cancellation' : getJobDisplayStatusLabel(job)}
    </Badge>
  );

  const filtered = useMemo(() => {
    if (jobsView === 'review') {
      return [...jobs.filter((j) => j.status === 'DISPUTED')].sort((a, b) => {
        const tsA = new Date(a.updatedAt ?? a.createdAt).getTime();
        const tsB = new Date(b.updatedAt ?? b.createdAt).getTime();
        return tsB - tsA;
      });
    }

    let list: Job[];
    if (filter === 'all') {
      list = jobs.filter(
        (j) => j.status !== 'PENDING' && j.status !== 'REJECTED' && j.status !== 'DISPUTED'
      );
    } else if (filter === 'pending') {
      list = jobs.filter((j) => j.status === 'PENDING');
    } else if (filter === 'active') {
      list = jobs.filter(
        (j) => ACTIVE_WORKFLOW_JOB_STATUSES.includes(j.status) && j.status !== 'DISPUTED'
      );
    } else if (filter === 'COMPLETED') {
      list = jobs.filter((j) => j.status === 'COMPLETED');
    } else if (filter === 'CANCELLED') {
      list = jobs.filter((j) => j.status === 'CANCELLED');
    } else {
      list = jobs.filter((j) => j.status === filter);
    }
    return [...list].sort((a, b) => {
      const tsA = new Date(a.updatedAt ?? a.createdAt).getTime();
      const tsB = new Date(b.updatedAt ?? b.createdAt).getTime();
      return tsB - tsA;
    });
  }, [jobs, filter, jobsView]);

  const groupedEntries = groupJobsForList(filtered);

  const renderJobRow = (job: Job, variant: JobListRowVariant) => (
    <>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className={cn('font-medium', variant === 'child' && 'text-sm')}>
            {variant === 'child' ? 'Material delivery' : job.categoryName}
          </p>
          {getStatusBadge(job)}
          {jobHasActivity(job.id) && (
            <ActivityDot aria-label="This job needs your attention" />
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">{job.description}</p>
        {variant === 'parent' && (
          <p className="mt-1 text-xs text-muted-foreground">Client: {job.userName}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end sm:text-right">
        {job.status === 'CANCELLED' && jobsView === 'jobs' && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-9 w-full whitespace-nowrap text-muted-foreground hover:bg-destructive sm:mt-0 sm:w-auto"
            onClick={(e) => {
              e.stopPropagation();
              setJobToDelete(job);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        )}
        {(() => {
          const { text, isPaid, refundAmount, refundStatus, underAdminReview } =
            getProviderJobPriceDisplay(job);
          const showRefund = hasRefundDisplay({ refundAmount, refundStatus });
          const processedRefund = isJobRefunded({ refundAmount, refundStatus });
          return (
            <>
              <p className="font-semibold tabular-nums">
                {text}
                {isPaid && !processedRefund ? <span className="ml-1 text-xs text-success">(Paid)</span> : null}
                {isPaid && processedRefund ? (
                  <span className="ml-1 text-xs text-destructive">(Refunded)</span>
                ) : null}
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
            </>
          );
        })()}
        <p className="text-xs text-muted-foreground">
          {new Date(job.createdAt).toLocaleDateString()}
        </p>
      </div>
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
              navigate(cancellation ? `/provider/cancellations/${dispute.id}` : `/provider/disputes/${dispute.id}`);
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
            onJobClick={(job) => navigate(`/provider/jobs/${job.id}`)}
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
          onJobClick={(job) => navigate(`/provider/jobs/${job.id}`)}
          renderRow={renderJobRow}
        />
      </div>
    );
  };

  const filters = [
    { value: 'all', label: 'All Jobs' },
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'Active' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Active Jobs</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Track your jobs and cases under review
          </p>
        </div>

        {jobsView === 'jobs' && (
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4',
                  filter === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                )}
              >
                {f.label}
                {f.value === 'active' && activeFilterHasDot && (
                  <ActivityDot aria-label="Active jobs need attention" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Tabs value={jobsView} onValueChange={(v) => setJobsView(v as JobsView)}>
            <TabsList>
              <TabsTrigger value="jobs">List of Jobs</TabsTrigger>
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

          {jobsView === 'review' && (
            <p className="text-sm text-muted-foreground">
              Jobs that are cancelled or disputed stay here while EloFix reviews the case.
            </p>
          )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card-elevated p-6 animate-pulse">
                <div className="h-6 w-48 bg-muted rounded mb-4" />
                <div className="h-4 w-full bg-muted rounded mb-2" />
                <div className="h-4 w-2/3 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          jobsView === 'review' ? (
            <div className="card-elevated w-full min-w-0 max-w-full overflow-hidden">
              <div className="divide-y divide-border">
                {groupedEntries.map((entry) => renderEntry(entry))}
              </div>
            </div>
          ) : jobsView === 'jobs' && filter === 'pending' ? (
            <div className="space-y-4">
              {filtered.map((job) => (
                <ProviderRequestCard
                  key={job.id}
                  job={job}
                  variant="pending"
                  onClick={() => navigate(`/provider/requests/${job.id}`)}
                />
              ))}
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
            <p className="text-muted-foreground text-sm">
              {jobsView === 'review'
                ? 'Cancelled or disputed jobs will appear here while EloFix reviews the case.'
                : filter === 'active'
                  ? 'Your active jobs will appear here'
                  : filter === 'all'
                    ? 'No jobs assigned to you yet'
                    : `No ${filter.toLowerCase().replace('_', ' ')} jobs`}
            </p>
          </div>
        )}
        </div>

        <DeleteJobDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) setJobToDelete(null);
          }}
          onConfirm={handleDeleteCancelled}
          jobId={jobToDelete?.id ?? ''}
        />
      </div>
    </DashboardLayout>
  );
}
