import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getPendingRequestsForProvider, getRejectedRequestsByProvider, deleteRejectedRequestFromProviderView } from '@/lib/api/jobs';
import { Job } from '@/types';
import { 
  ClipboardList, Package, Calendar, User, XCircle, Trash2
} from 'lucide-react';
import { DeleteRejectedRequestDialog } from '@/components/jobs/DeleteRejectedRequestDialog';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/uploadUrl';

export default function ProviderRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [rejectedJobs, setRejectedJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    try {
      const [pending, rejected] = await Promise.all([
        getPendingRequestsForProvider(user.id),
        getRejectedRequestsByProvider(user.id),
      ]);
      setPendingJobs(pending);
      setRejectedJobs(rejected);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

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

  const RequestCard = ({ job, showRejection = false }: { job: Job; showRejection?: boolean }) => (
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
        </div>

        {/* Estimate & Actions */}
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end sm:text-right">
          <p className="text-lg font-bold text-primary">
            R{job.totalEstimateRange.min}
          </p>
          <p className="text-xs text-muted-foreground">
            R{job.totalEstimateRange.min} - R{job.totalEstimateRange.max}
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
        </Tabs>

        <DeleteRejectedRequestDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setJobToDelete(null); }}
          onConfirm={handleDeleteRejected}
        />
      </div>
    </DashboardLayout>
  );
}
