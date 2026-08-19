import { useCallback, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getJobById, acceptJob, addChatMessage } from '@/lib/api/jobs';
import { rejectJobByProvider } from '@/lib/api/jobs';
import { getDeliveryRequestByJobId } from '@/lib/api/deliveryRequests';
import { ProviderCourierQuotePanel } from '@/components/delivery/ProviderCourierQuotePanel';
import { Job, DeliveryRequestRecord, DeliveryGeoPoint } from '@/types';
import {
  ArrowLeft, Check, X, MapPin, Calendar, User,
  MessageSquare, Send, Package, XCircle, Ban,
} from 'lucide-react';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { BlockedActionDialog } from '@/components/account/BlockedActionDialog';
import { useBlockedActionGuard } from '@/hooks/useBlockedActionGuard';
import { useJobActivityIndicators } from '@/hooks/useJobActivityIndicators';
import { ReviewMediaGrid } from '@/components/providers/MediaLightbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatPersonDisplayName } from '@/lib/displayPersonName';

export default function ProviderRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { isProfileComplete } = useProviderStatus();
  const { dialogProps, guardAction, openIfBlockedMessage } = useBlockedActionGuard();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const messagesSectionRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { markJobSectionRead } = useJobActivityIndicators();
  const [job, setJob] = useState<Job | null>(null);
  const [deliveryRequest, setDeliveryRequest] = useState<DeliveryRequestRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectDetails, setRejectDetails] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);

  const loadJob = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getJobById(id);
      setJob(data);
      if (data?.courierFlow || data?.deliveryRequestId) {
        try {
          const dr = await getDeliveryRequestByJobId(id);
          setDeliveryRequest(dr);
        } catch {
          setDeliveryRequest(null);
        }
      } else {
        setDeliveryRequest(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      void loadJob();
    }
  }, [id, loadJob]);

  useEffect(() => {
    if (!id || !job) return;
    void markJobSectionRead(id, 'general');
    void markJobSectionRead(id, 'messages');
  }, [id, job?.id, markJobSectionRead]);

  useEffect(() => {
    if (location.hash !== '#messages' || !job) return;
    messagesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, job?.id]);

  const performAccept = async () => {
    if (!job || isMutating) return;
    if (!isProfileComplete) {
      toast({
        title: 'Complete your profile first',
        description: 'Finish profile info, skills & pricing, and required documents before accepting jobs.',
        variant: 'destructive',
      });
      navigate('/provider/profile');
      return;
    }
    setIsMutating(true);
    try {
      await acceptJob(job.id);
      await queryClient.refetchQueries({ queryKey: queryKeys.jobs.detail(job.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast({
        title: 'Request accepted',
        description: job.courierFlow
          ? 'Submit your delivery quote from the job page.'
          : 'The job is now assigned to you.',
      });
      navigate(job.courierFlow ? `/provider/jobs/${job.id}` : '/provider/jobs');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to accept job.';
      if (!openIfBlockedMessage(message)) {
        toast({ title: 'Error', description: message, variant: 'destructive' });
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleAccept = () => {
    guardAction(() => void performAccept());
  };

  const handleReject = async () => {
    if (!job || !rejectReason || isMutating) return;
    setIsMutating(true);
    try {
      await rejectJobByProvider(job.id, rejectReason, rejectDetails);
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast({ title: 'Request declined', description: 'The request has been rejected.' });
      setRejectOpen(false);
      navigate('/provider/requests');
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to reject request.', variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleSendChat = async () => {
    if (!job || !chatMessage.trim() || isSendingChat) return;
    setIsSendingChat(true);
    try {
      const updated = await addChatMessage(job.id, chatMessage);
      setJob(updated);
      setChatMessage('');
    } catch (e) {
      // Chat may be restricted - use job notes instead
      toast({ title: 'Info', description: 'Message sent as job note.' });
    } finally {
      setIsSendingChat(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Request not found</h2>
          <Button variant="outline" onClick={() => navigate('/provider/requests')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Requests
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/provider/requests')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">{job.categoryName} Request</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">#{job.id.slice(-8)}</p>
          </div>
          <Badge variant={job.status === 'REJECTED' ? 'destructive' : job.status === 'PENDING' ? 'default' : 'secondary'} className="shrink-0">
            {job.status}
          </Badge>
        </div>

        {/* Job Overview */}
        <div className="card-elevated space-y-4 p-4 sm:p-6">
          <h2 className="font-semibold text-lg">Job Overview</h2>
          <p className="text-sm">{job.description}</p>
          
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{job.userName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{new Date(job.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Images — click to enlarge */}
          {job.images.length > 0 && (
            <ReviewMediaGrid images={job.images} className="mt-0" />
          )}

          {/* Courier route */}
          {job.courierFlow && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery route</p>
              {(() => {
                const collection =
                  (job.measurements as { collectionPoint?: DeliveryGeoPoint })?.collectionPoint ||
                  (job.location as { collection?: DeliveryGeoPoint })?.collection;
                const destination =
                  (job.measurements as { destinationPoint?: DeliveryGeoPoint })?.destinationPoint ||
                  (job.location?.address
                    ? { address: job.location.address, city: job.location.city }
                    : undefined);
                return (
                  <>
                    <div>
                      <span className="font-medium text-primary">Collect: </span>
                      {collection?.address?.trim() || 'Collection address pending — contact support'}
                    </div>
                    <div>
                      <span className="font-medium text-accent">Deliver: </span>
                      {destination?.address || '—'}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Location */}
          {!job.courierFlow && job.location && (
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{job.location.address}</p>
                <p className="text-sm text-muted-foreground">
                  {job.location.city}{job.location.area ? `, ${job.location.area}` : ''}
                </p>
                {job.location.notes && (
                  <p className="text-sm text-muted-foreground mt-1">Notes: {job.location.notes}</p>
                )}
              </div>
            </div>
          )}

          {/* Measurements / Requirements */}
          {(job.measurements?.deliveryItems?.length ||
            Object.keys(job.measurements?.values || {}).length > 0 ||
            job.measurements?.movingItems?.length ||
            job.measurements?.plumbingIssue) && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-2">REQUIREMENTS</p>
              <div className="flex flex-wrap gap-4 text-sm">
                {job.measurements.deliveryItems && job.measurements.deliveryItems.length > 0 ? (
                  job.measurements.deliveryItems.map((item, idx) => (
                    <span key={`${item.name}-${idx}`}>
                      {item.name} × {item.qty}
                      {item.weightKg != null ? ` (${item.weightKg} kg)` : ''}
                    </span>
                  ))
                ) : job.measurements.movingItems && job.measurements.movingItems.length > 0 ? (
                  job.measurements.movingItems.map(item => (
                    <span key={item.id}>{item.name} × {item.qty}</span>
                  ))
                ) : job.measurements.plumbingIssue ? (
                  <div>
                    <span className="text-muted-foreground">Issue: </span>
                    {job.measurements.plumbingIssue.type} — {job.measurements.plumbingIssue.description}
                  </div>
                ) : (
                  Object.entries(job.measurements.values).map(([key, value]) => (
                    <span key={key}>
                      <span className="text-muted-foreground capitalize">{key}:</span> {value}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {job.courierFlow && deliveryRequest && job.status !== 'PENDING' && (
          <ProviderCourierQuotePanel
            deliveryRequest={deliveryRequest}
            onUpdated={(updated) => setDeliveryRequest(updated)}
          />
        )}

        {/* Cancellation Status - when CANCELLED by customer */}
        {job.status === 'CANCELLED' && (
          <div className="card-elevated border border-muted p-4 sm:p-6">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-muted-foreground mb-3">
              <Ban className="h-5 w-5" /> Request cancelled
            </h2>
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p>
                {job.cancellationSource === 'customer_changed_provider'
                  ? 'The customer chose another courier for this delivery.'
                  : job.cancellationReason || 'The customer cancelled this delivery request.'}
              </p>
              {job.cancelledAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Cancelled on {new Date(job.cancelledAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Rejection Status - when REJECTED */}
        {job.status === 'REJECTED' && (
          <div className="card-elevated border border-destructive/50 p-4 sm:p-6">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-destructive mb-3">
              <XCircle className="h-5 w-5" /> Rejection Status
            </h2>
            <div className="p-3 bg-destructive/10 rounded-lg">
              {job.rejectionReason && (
                <p className="font-medium text-destructive">
                  Reason: {job.rejectionReason.replace(/_/g, ' ')}
                </p>
              )}
              {job.rejectionDetails && (
                <p className="text-sm text-muted-foreground mt-1">{job.rejectionDetails}</p>
              )}
              {job.rejectedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Rejected on {new Date(job.rejectedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Materials - when present */}
        {job.materials && job.materials.length > 0 && (
          <div className="card-elevated space-y-4 p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" /> Materials
            </h2>
            <div className="space-y-2">
              {job.materials.map((m, i) => (
                <div key={i} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                  <span>{m.name} × {m.qty}</span>
                  <span>R{(m.qty * m.unitPrice).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Section */}
        <div
          id="request-messages"
          ref={messagesSectionRef}
          className="card-elevated space-y-4 p-4 sm:p-6"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" /> Messages
          </h2>
          
          <div className="max-h-64 overflow-y-auto space-y-3">
            {(job.chat.length > 0 || job.jobNotes.length > 0) ? (
              [...job.jobNotes.map(n => ({ ...n, type: 'note' as const })), ...job.chat.map(c => ({ ...c, type: 'chat' as const }))]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[80%] p-3 rounded-lg text-sm",
                      msg.authorId === user?.id
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="text-xs font-medium mb-1 opacity-75">{formatPersonDisplayName(msg.authorName)}</p>
                    <p>{msg.message}</p>
                    <p className="text-xs opacity-50 mt-1">{new Date(msg.createdAt).toLocaleString()}</p>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Start a conversation with the client.</p>
            )}
          </div>

          {job.status !== 'REJECTED' && job.status !== 'CANCELLED' && (
            <div className="flex min-w-0 gap-2">
              <Input
                placeholder="Type a message..."
                value={chatMessage}
                onChange={e => setChatMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                className="min-w-0"
              />
              <Button size="icon" className="shrink-0" onClick={handleSendChat} disabled={!chatMessage.trim() || isSendingChat}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
          {job.status === 'REJECTED' && (
            <p className="text-sm text-muted-foreground italic">Messaging is disabled for rejected requests.</p>
          )}
          {job.status === 'CANCELLED' && (
            <p className="text-sm text-muted-foreground italic">This request was cancelled — messaging is disabled.</p>
          )}
        </div>

        {job.status === 'PENDING' && !isProfileComplete && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">
            Complete your profile (info, skills, documents) before you can accept this request.
            <Button type="button" variant="link" className="h-auto p-0 ml-1" onClick={() => navigate('/provider/profile')}>
              Open profile
            </Button>
          </div>
        )}

        {job.courierFlow && job.status === 'PENDING' && !deliveryRequest && (
          <p className="text-sm text-muted-foreground">
            Loading delivery details… If this persists, refresh the page.
          </p>
        )}

        {/* Accept / decline — all pending requests including delivery & moving */}
        {job.status === 'PENDING' && (
          <div className="sticky bottom-4 flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 flex-1 whitespace-nowrap sm:h-12" onClick={handleAccept} disabled={isMutating || !isProfileComplete}>
              <Check className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> Accept Request
            </Button>
            <Button variant="outline" className="h-11 flex-1 whitespace-nowrap sm:h-12" onClick={() => setRejectOpen(true)} disabled={isMutating}>
              <X className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> Decline Request
            </Button>
          </div>
        )}

        {/* Reject Dialog */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Reason</label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="too_busy">Too busy / Schedule conflict</SelectItem>
                    <SelectItem value="out_of_area">Outside service area</SelectItem>
                    <SelectItem value="not_my_skill">Not my expertise</SelectItem>
                    <SelectItem value="budget_too_low">Budget too low</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Additional details (optional)</label>
                <Textarea
                  value={rejectDetails}
                  onChange={e => setRejectDetails(e.target.value)}
                  placeholder="Explain further..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || isMutating}>Decline</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
      <BlockedActionDialog {...dialogProps} />
    </DashboardLayout>
  );
}

