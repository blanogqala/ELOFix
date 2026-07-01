import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  getPendingRequestsForProvider,
  getRejectedRequestsByProvider,
  getCancelledRequestsForProvider,
  deleteRejectedRequestFromProviderView,
  deleteCancelledRequestFromProviderView,
} from '@/lib/api/jobs';
import { Job } from '@/types';
import {
  ClipboardList, Package, Calendar, User, XCircle, Trash2, Ban,
} from 'lucide-react';
import { DeleteRejectedRequestDialog } from '@/components/jobs/DeleteRejectedRequestDialog';
import { cn } from '@/lib/utils';
import { getProviderJobPriceDisplay } from '@/lib/jobUtils';
import { ProviderRequestCard } from '@/components/jobs/ProviderRequestCard';

export default function ProviderRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [rejectedJobs, setRejectedJobs] = useState<Job[]>([]);
  const [cancelledJobs, setCancelledJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCancelledDialogOpen, setDeleteCancelledDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    try {
      const [pending, rejected, cancelled] = await Promise.all([
        getPendingRequestsForProvider(user.id),
        getRejectedRequestsByProvider(user.id),
        getCancelledRequestsForProvider(user.id),
      ]);
      setPendingJobs(pending);
      setRejectedJobs(rejected);
      setCancelledJobs(cancelled);
    } catch (error) {
      console.error('Failed to load requests:', error);
      toast({
        title: 'Could not load requests',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      void loadJobs();
    }
  }, [user, loadJobs]);

  const handleDeleteRejected = async () => {
    if (!user || !jobToDelete) return;
    try {
      await deleteRejectedRequestFromProviderView(user.id, jobToDelete.id);
      setRejectedJobs(prev => prev.filter(j => j.id !== jobToDelete.id));
      setDeleteDialogOpen(false);
      setJobToDelete(null);
      toast({ title: 'Deleted', description: 'Rejected request removed from your list.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const handleDeleteCancelled = async () => {
    if (!user || !jobToDelete) return;
    try {
      await deleteCancelledRequestFromProviderView(user.id, jobToDelete.id);
      setCancelledJobs(prev => prev.filter(j => j.id !== jobToDelete.id));
      setDeleteCancelledDialogOpen(false);
      setJobToDelete(null);
      toast({ title: 'Deleted', description: 'Cancelled request removed from your list.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const cancellationLabel = (job: Job) => {
    if (job.cancellationSource === 'customer_changed_provider') {
      return 'Customer chose another courier';
    }
    return job.cancellationReason || 'Customer cancelled delivery';
  };

  // Card UI extracted to `ProviderRequestCard` for reuse in Active Jobs → Pending.

  const SkeletonCards = () => (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card-elevated p-6 animate-pulse">
          <div className="flex gap-4">
            <div className="h-24 w-24 rounded-lg bg-muted" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-32 bg-muted rounded" />
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-3 w-48 bg-muted rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Requests</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Review and respond to job requests</p>
        </div>

        <Tabs defaultValue="pending" className="w-full min-w-0">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 sm:gap-0">
            <TabsTrigger value="pending" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Pending Requests
              {pendingJobs.length > 0 && (
                <Badge variant="secondary" className="ml-1">{pendingJobs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-2">
              <XCircle className="h-4 w-4" />
              Rejected
              {rejectedJobs.length > 0 && (
                <Badge variant="secondary" className="ml-1">{rejectedJobs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-2">
              <Ban className="h-4 w-4" />
              Canceled
              {cancelledJobs.length > 0 && (
                <Badge variant="secondary" className="ml-1">{cancelledJobs.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {isLoading ? <SkeletonCards /> : pendingJobs.length > 0 ? (
              <div className="space-y-4">
                {pendingJobs.map(job => (
                  <ProviderRequestCard key={job.id} job={job} variant="pending" />
                ))}
              </div>
            ) : (
              <div className="card-elevated p-12 text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No pending requests</h3>
                <p className="text-muted-foreground text-sm">
                  New job requests will appear here when customers select you
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected">
            {isLoading ? <SkeletonCards /> : rejectedJobs.length > 0 ? (
              <div className="space-y-4">
                {rejectedJobs.map(job => (
                  <ProviderRequestCard
                    key={job.id}
                    job={job}
                    variant="rejected"
                    actions={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-full whitespace-nowrap text-muted-foreground hover:bg-destructive sm:w-auto"
                        onClick={(e) => {
                          e.stopPropagation();
                          setJobToDelete(job);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Delete
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="card-elevated p-12 text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No rejected requests</h3>
                <p className="text-muted-foreground text-sm">
                  Requests you decline will appear here
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cancelled">
            {isLoading ? <SkeletonCards /> : cancelledJobs.length > 0 ? (
              <div className="space-y-4">
                {cancelledJobs.map(job => (
                  <ProviderRequestCard
                    key={job.id}
                    job={job}
                    variant="cancelled"
                    actions={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-full whitespace-nowrap sm:w-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/provider/requests/${job.id}`);
                          }}
                        >
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-full whitespace-nowrap text-muted-foreground hover:bg-destructive sm:w-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setJobToDelete(job);
                            setDeleteCancelledDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Delete
                        </Button>
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="card-elevated p-12 text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Ban className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No canceled requests</h3>
                <p className="text-muted-foreground text-sm">
                  Delivery requests cancelled by customers will appear here
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DeleteRejectedRequestDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setJobToDelete(null); }}
          onConfirm={handleDeleteRejected}
        />
        <DeleteRejectedRequestDialog
          open={deleteCancelledDialogOpen}
          onOpenChange={(open) => { setDeleteCancelledDialogOpen(open); if (!open) setJobToDelete(null); }}
          onConfirm={handleDeleteCancelled}
          title="Delete Canceled Request?"
          description="Remove this canceled delivery request from your list?"
        />
      </div>
    </DashboardLayout>
  );
}
