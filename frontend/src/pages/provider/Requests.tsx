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
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { getProviderJobPriceDisplay } from '@/lib/jobUtils';

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

  const RequestCard = ({
    job,
    showRejection = false,
    showCancellation = false,
  }: {
    job: Job;
    showRejection?: boolean;
    showCancellation?: boolean;
  }) => (
    <div
      className="card-elevated cursor-pointer p-4 transition-shadow hover:shadow-lg sm:p-6"
      onClick={() => navigate(`/provider/requests/${job.id}`)}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Thumbnail */}
        <div className="flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:aspect-square sm:h-24 sm:w-24">
          {job.images[0] ? (
            <img src={resolveUploadUrl(job.images[0])} alt="" className="h-full w-full object-cover" />
          ) : (
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="font-semibold">{job.categoryName}</h3>
            {job.courierFlow ? (
              <Badge variant="outline" className="text-xs">Delivery</Badge>
            ) : null}
            <Badge variant="secondary" className="text-xs">#{job.id.slice(-8)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{job.description}</p>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {job.userName}
            </span>
            {job.courierFlow ? (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" /> Delivery / moving
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" /> {job.materials?.length ?? 0} materials
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {new Date(job.createdAt).toLocaleDateString()}
            </span>
          </div>

          {showRejection && job.rejectionReason && (
            <div className="mt-3 p-2 bg-destructive/10 rounded text-sm">
              <span className="font-medium text-destructive">Reason: </span>
              <span className="text-muted-foreground">{job.rejectionReason.replace(/_/g, ' ')}</span>
              {job.rejectionDetails && (
                <p className="text-xs text-muted-foreground mt-1">{job.rejectionDetails}</p>
              )}
            </div>
          )}
          {showCancellation && (
            <div className="mt-3 p-2 bg-muted rounded text-sm">
              <span className="font-medium text-muted-foreground">Cancelled: </span>
              <span>{cancellationLabel(job)}</span>
            </div>
          )}
        </div>

        {/* Estimate & Actions */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end sm:text-right">
          <p className="text-lg font-bold text-primary tabular-nums">
            {getProviderJobPriceDisplay(job).text}
          </p>
          {showRejection ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full whitespace-nowrap text-muted-foreground hover:bg-destructive sm:w-auto"
              onClick={e => { e.stopPropagation(); setJobToDelete(job); setDeleteDialogOpen(true); }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          ) : showCancellation ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full whitespace-nowrap sm:w-auto"
                onClick={e => { e.stopPropagation(); navigate(`/provider/requests/${job.id}`); }}
              >
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full whitespace-nowrap text-muted-foreground hover:bg-destructive sm:w-auto"
                onClick={e => { e.stopPropagation(); setJobToDelete(job); setDeleteCancelledDialogOpen(true); }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-9 w-full whitespace-nowrap sm:w-auto" onClick={e => { e.stopPropagation(); navigate(`/provider/requests/${job.id}`); }}>
              View Details
            </Button>
          )}
        </div>
      </div>
    </div>
  );

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
                {pendingJobs.map(job => <RequestCard key={job.id} job={job} />)}
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
                {rejectedJobs.map(job => <RequestCard key={job.id} job={job} showRejection />)}
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
                  <RequestCard key={job.id} job={job} showCancellation />
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
