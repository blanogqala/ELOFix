import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getJobsByProvider, deleteJob } from '@/lib/api/jobs';
import { queryKeys } from '@/lib/queryKeys';
import { Job } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import { getJobDisplayStatusLabel, getProviderJobBadgeVariantForJob } from '@/lib/jobProgressDisplay';
import { ACTIVE_WORKFLOW_JOB_STATUSES } from '@/lib/jobStatusMapping';

export default function ProviderActiveJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = user?.id ?? '';
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: queryKeys.jobs.byProvider(userId),
    queryFn: () => getJobsByProvider(userId),
    enabled: Boolean(userId),
  });
  const [filter, setFilter] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);

  const handleDeleteCancelled = async () => {
    if (!jobToDelete) return;
    try {
      await deleteJob(jobToDelete.id);
      queryClient.removeQueries({ queryKey: queryKeys.jobs.detail(jobToDelete.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      setDeleteDialogOpen(false);
      setJobToDelete(null);
      toast({ title: 'Deleted', description: 'Cancelled job removed from your list.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const getStatusBadge = (job: Job) => (
    <Badge variant={getProviderJobBadgeVariantForJob(job)}>{getJobDisplayStatusLabel(job)}</Badge>
  );

  const filtered = (() => {
    let list: Job[];
    if (filter === 'all') {
      list = jobs.filter(j => j.status !== 'PENDING' && j.status !== 'REJECTED');
    } else if (filter === 'pending') {
      list = jobs.filter(j => j.status === 'PENDING');
    } else if (filter === 'active') {
      list = jobs.filter(j => ACTIVE_WORKFLOW_JOB_STATUSES.includes(j.status));
    } else if (filter === 'COMPLETED') {
      list = jobs.filter(j => j.status === 'COMPLETED');
    } else if (filter === 'CANCELLED') {
      list = jobs.filter(j => j.status === 'CANCELLED');
    } else {
      list = jobs.filter(j => j.status === filter);
    }
    return [...list].sort((a, b) => {
      const tsA = new Date(a.updatedAt ?? a.createdAt).getTime();
      const tsB = new Date(b.updatedAt ?? b.createdAt).getTime();
      return tsB - tsA;
    });
  })();

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
          <p className="text-sm text-muted-foreground sm:text-base">Track your ongoing and completed jobs</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

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
          <div className="space-y-4">
            {filtered.map(job => (
              <div
                key={job.id}
                className="card-elevated cursor-pointer p-4 transition-shadow hover:shadow-lg sm:p-6"
                onClick={() => navigate(`/provider/jobs/${job.id}`)}
              >
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Briefcase className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-medium">{job.categoryName}</p>
                      {getStatusBadge(job)}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{job.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Client: {job.userName}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end sm:text-right">
                    {job.status === 'CANCELLED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-9 w-full whitespace-nowrap text-muted-foreground hover:bg-destructive sm:mt-0 sm:w-auto"
                        onClick={e => { e.stopPropagation(); setJobToDelete(job); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Delete
                      </Button>
                    )}
                    <p className="font-semibold">R{job.servicePrice?.amount ?? job.laborEstimateRange?.min ?? 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-elevated p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No jobs found</h3>
            <p className="text-muted-foreground text-sm">
              {filter === 'active' ? 'Your active jobs will appear here' : filter === 'all' ? 'No jobs assigned to you yet' : `No ${filter.toLowerCase().replace('_', ' ')} jobs`}
            </p>
          </div>
        )}

        <DeleteJobDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setJobToDelete(null); }}
          onConfirm={handleDeleteCancelled}
          jobId={jobToDelete?.id ?? ''}
        />
      </div>
    </DashboardLayout>
  );
}
