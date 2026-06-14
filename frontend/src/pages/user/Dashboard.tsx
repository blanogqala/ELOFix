import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { getJobsByUser } from '@/lib/api/jobs';
import { queryKeys } from '@/lib/queryKeys';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import { Job } from '@/types';
import { SpecialsCarousel } from '@/components/dashboard/SpecialsCarousel';
import { 
  FileText, 
  Briefcase, 
  CheckCircle, 
  Clock,
  Plus,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getJobDisplayStatusLabel, getUserJobBadgeClassForJob } from '@/lib/jobProgressDisplay';
import { groupJobsForList } from '@/lib/jobListGrouping';
import { JobListGroup, JobListRowVariant } from '@/components/jobs/JobListGroup';
import { isActiveWorkflowStatus } from '@/lib/jobStatusMapping';

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? '';
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: queryKeys.jobs.byUser(userId),
    queryFn: () => getJobsByUser(userId),
    enabled: Boolean(userId),
  });

  const stats = {
    active: jobs.filter(j => isActiveWorkflowStatus(j.status)).length,
    completed: jobs.filter(j => j.status === 'COMPLETED').length,
    pending: jobs.filter(j => j.status === 'PENDING').length,
  };

  const recentJobs = [...jobs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const groupedRecentJobs = groupJobsForList(recentJobs).slice(0, 3);

  const getStatusBadge = (job: Job) => (
    <span className={cn('status-badge', getUserJobBadgeClassForJob(job))}>
      {getJobDisplayStatusLabel(job)}
    </span>
  );

  const renderJobRow = (job: Job, variant: JobListRowVariant) => (
    <>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <p className={cn('truncate font-medium', variant === 'child' && 'text-sm')}>
            {variant === 'child' ? 'Material delivery' : job.categoryName}
          </p>
          {getStatusBadge(job)}
        </div>
        <p className="truncate text-sm text-muted-foreground">{job.description}</p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
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
    </>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        {/* Welcome Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">
              Welcome back, {user?.name?.split(' ')[0]}!
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">Here&apos;s an overview of your service requests</p>
          </div>
          <Button className="btn-accent h-10 w-full shrink-0 whitespace-nowrap sm:w-auto" onClick={() => navigate('/user/new-request')}>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </div>

        {/* Monthly Specials Carousel */}
        <SpecialsCarousel />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                <Clock className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{stats.active}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Active Jobs</p>
              </div>
            </div>
          </div>
          
          <div className="card-elevated p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
                <FileText className="h-4 w-4 text-warning sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold sm:text-2xl">{stats.pending}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending Requests</p>
              </div>
            </div>
          </div>
          
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
        </div>

        {/* Recent Jobs */}
        <div className="card-elevated overflow-hidden">
          <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-2 sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0 col-span-1">
              <h2 className="text-lg font-semibold sm:text-xl">Recent Jobs</h2>
            </div>
            <div className="flex justify-end sm:justify-end sm:ml-48 sm:mt-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/user/jobs')}>
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
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
          ) : groupedRecentJobs.length > 0 ? (
            <div className="divide-y divide-border">
              {groupedRecentJobs.map((entry) => (
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
              <h3 className="font-semibold mb-2">No jobs yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first service request to get started
              </p>
              <Button onClick={() => navigate('/user/new-request')}>
                Create Request
              </Button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <div 
            className="card-elevated cursor-pointer p-4 transition-colors hover:border-primary/30 sm:p-6"
            onClick={() => navigate('/user/new-request')}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Plus className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="font-medium">New Service Request</p>
                <p className="text-sm text-muted-foreground">Find a provider for your task</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card-elevated cursor-pointer p-4 transition-colors hover:border-primary/30 sm:p-6"
            onClick={() => navigate('/user/jobs')}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">View All Jobs</p>
                <p className="text-sm text-muted-foreground">Track and manage your jobs</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card-elevated cursor-pointer p-4 transition-colors hover:border-primary/30 sm:p-6"
            onClick={() => navigate('/user/profile')}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                <CheckCircle className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="font-medium">Profile Settings</p>
                <p className="text-sm text-muted-foreground">Update your information</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
