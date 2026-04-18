import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { getJobsByUser } from '@/lib/api/jobs';
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
import { getStandardizedStatusLabel, getUserStatusBadgeClass, isActiveWorkflowStatus } from '@/lib/jobStatusMapping';

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    try {
      const userJobs = await getJobsByUser(user.id);
      setJobs(userJobs);
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

  const stats = {
    active: jobs.filter(j => isActiveWorkflowStatus(j.status)).length,
    completed: jobs.filter(j => j.status === 'COMPLETED').length,
    pending: jobs.filter(j => j.status === 'PENDING').length,
  };

  const recentJobs = [...jobs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const getStatusBadge = (status: Job['status']) => (
    <span className={cn('status-badge', getUserStatusBadgeClass(status))}>
      {getStandardizedStatusLabel(status)}
    </span>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]}!</h1>
            <p className="text-muted-foreground">Here's an overview of your service requests</p>
          </div>
          <Button className="btn-accent" onClick={() => navigate('/user/new-request')}>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </div>

        {/* Monthly Specials Carousel */}
        <SpecialsCarousel />

        {/* Stats Cards */}
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-4">
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-muted-foreground">Active Jobs</p>
              </div>
            </div>
          </div>
          
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending Requests</p>
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
        </div>

        {/* Recent Jobs */}
        <div className="card-elevated">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Recent Jobs</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/user/jobs')}>
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
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
              {recentJobs.map((job) => (
                <div 
                  key={job.id} 
                  className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/user/jobs/${job.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{job.categoryName}</p>
                        {getStatusBadge(job.status)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{job.description}</p>
                    </div>
                    <div className="text-right hidden sm:block">
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
                  </div>
                </div>
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/user/new-request')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium">New Service Request</p>
                <p className="text-sm text-muted-foreground">Find a provider for your task</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/user/jobs')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">View All Jobs</p>
                <p className="text-sm text-muted-foreground">Track and manage your jobs</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card-elevated p-6 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate('/user/profile')}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-success" />
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
