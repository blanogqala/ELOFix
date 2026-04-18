import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getJobsByProvider, deleteJob } from '@/lib/api/jobs';
import { Job } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import {
  getStandardizedStatusLabel,
  getProviderStatusBadgeVariant,
  ACTIVE_WORKFLOW_JOB_STATUSES,
} from '@/lib/jobStatusMapping';

export default function ProviderActiveJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getJobsByProvider(user.id);
      setJobs(data);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadJobs();
    }
  }, [user, loadJobs]);

  const handleDeleteCancelled = async () => {
    if (!jobToDelete) return;
    try {
      await deleteJob(jobToDelete.id);
      setJobs(prev => prev.filter(j => j.id !== jobToDelete.id));
      setDeleteDialogOpen(false);
      setJobToDelete(null);
      toast({ title: 'Deleted', description: 'Cancelled job removed from your list.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: Job['status']) => (
    <Badge variant={getProviderStatusBadgeVariant(status)}>{getStandardizedStatusLabel(status)}</Badge>
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
      <div className="space-y-6 animate-fade-in p-4">
        <div>
          <h1 className="text-2xl font-bold">Active Jobs</h1>
          <p className="text-muted-foreground">Track your ongoing and completed jobs</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
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
                className="card-elevated p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/provider/jobs/${job.id}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Briefcase className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-medium">{job.categoryName}</p>
                      {getStatusBadge(job.status)}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{job.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Client: {job.userName}</p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="font-semibold">R{job.servicePrice?.amount ?? job.laborEstimateRange?.min ?? 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                    {job.status === 'CANCELLED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground hover:bg-destructive mt-2"
                        onClick={e => { e.stopPropagation(); setJobToDelete(job); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    )}
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
