import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getJobsByUser } from '@/lib/api/jobs';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import { Job } from '@/types';
import { Search, Briefcase, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStandardizedStatusLabel, getUserStatusBadgeClass, isActiveWorkflowStatus } from '@/lib/jobStatusMapping';
import { useToast } from '@/hooks/use-toast';

export default function UserJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'completed' | 'cancelled'>('all');
  const { toast } = useToast();

  const loadJobs = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const userJobs = await getJobsByUser(user.id);
      setJobs(userJobs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load jobs.';
      setLoadError(message);
      toast({
        title: 'Could not load jobs',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (user) {
      void loadJobs();
    }
  }, [user, loadJobs]);

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

  const getStatusBadge = (status: Job['status']) => (
    <span className={cn('status-badge', getUserStatusBadgeClass(status))}>
      {getStandardizedStatusLabel(status)}
    </span>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Jobs</h1>
            <p className="text-muted-foreground">Track and manage your service requests</p>
          </div>
          <Button className="btn-accent" onClick={() => navigate('/user/new-request')}>
            New Request
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by category or description"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 h-11 rounded-lg border border-input focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pending', 'active', 'completed', 'cancelled'] as const).map((filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Jobs List */}
        <div className="card-elevated w-[540px] sm:w-[690px] md:w-[768px] lg:w-full">
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
              <Button onClick={loadJobs} variant="outline">
                Retry
              </Button>
            </div>
          ) : filteredJobs.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredJobs.map((job) => (
                <div 
                  key={job.id} 
                  className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/user/jobs/${job.id}`)}
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
                      {job.providerName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Provider: {job.providerName}
                        </p>
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
                    <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                </div>
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
