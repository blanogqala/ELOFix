import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getJobById, addJobNote, addChatMessage, cancelJob, updateJobStatus, markInspectionDone, submitServicePrice, submitMaterials, acceptUserSuggestion, rejectUserSuggestion, updateProviderRequirements, getLaborInvoiceByJobId } from '@/lib/api/jobs';
import { getSuppliers } from '@/lib/api/suppliers';
import { Job, MaterialLine, Supplier, Measurements } from '@/types';
import {
  ArrowLeft, User, Calendar, Package, MessageSquare, Send, MapPin,
  ShoppingCart, XCircle, CheckCircle, Clock, AlertTriangle, DollarSign, Check, X,
  Pencil, ExternalLink, CreditCard, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { AddMaterialsModal } from '@/components/jobs/AddMaterialsModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import {
  getStandardizedStatusLabel,
  getProviderStatusBadgeVariant,
  ACTIVE_WORKFLOW_JOB_STATUSES,
} from '@/lib/jobStatusMapping';
import { USER_TIMELINE_STEPS, getUserTimelineViewState } from '@/lib/userJobTimeline';
import { getTimelineStepInsight } from '@/lib/jobTimelineInsights';

export default function ProviderJobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [commTab, setCommTab] = useState<'messages' | 'notes'>('messages');
  const [materialViewTab, setMaterialViewTab] = useState<'orders' | 'suggestions'>('orders');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDetails, setCancelDetails] = useState('');
  const [materialsBuilder, setMaterialsBuilder] = useState<MaterialLine[]>([]);
  const [servicePriceAmount, setServicePriceAmount] = useState('');
  const [servicePriceNote, setServicePriceNote] = useState('');
  const [addMaterialsOpen, setAddMaterialsOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editRequirementsOpen, setEditRequirementsOpen] = useState(false);
  const [editMeasurements, setEditMeasurements] = useState<Partial<Measurements>>({});
  const [editRequirementNotes, setEditRequirementNotes] = useState('');
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  const [legacyInvoice, setLegacyInvoice] = useState<{ paidAt: string; cardLast4?: string } | null>(null);
  const [lockedTimelineStep, setLockedTimelineStep] = useState<number | null>(null);
  const [hoveredTimelineStep, setHoveredTimelineStep] = useState<number | null>(null);

  useEffect(() => {
    if (paymentDetailsOpen && job?.laborPaid && !job.servicePayment) {
      getLaborInvoiceByJobId(job.id).then(inv => {
        if (inv) setLegacyInvoice({ paidAt: inv.paidAt, cardLast4: inv.cardLast4 });
      });
    } else {
      setLegacyInvoice(null);
    }
  }, [paymentDetailsOpen, job?.id, job?.laborPaid, job?.servicePayment]);

  const loadJob = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getJobById(id);
      setJob(data);
      setMaterialsBuilder([]);
    } catch (e) {
      setJob(null);
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load job details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (id) {
      void loadJob();
      void getSuppliers()
        .then(setSuppliers)
        .catch((error) => {
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to load suppliers.',
            variant: 'destructive',
          });
        });
    }
  }, [id, loadJob, toast]);

  useEffect(() => {
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key?.includes('jobs') && id) {
        void loadJob();
      }
    };
    window.addEventListener('storage', handleStorageUpdate);
    return () => window.removeEventListener('storage', handleStorageUpdate);
  }, [id, loadJob]);

  const handleMarkInspectionDone = async () => {
    if (!job) return;
    try {
      const updated = await markInspectionDone(job.id);
      setJob(updated);
      toast({ title: 'Inspection marked done', description: 'You can now submit the service price.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' });
    }
  };

  const handleSubmitServicePrice = async () => {
    if (!job || !servicePriceAmount) return;
    const amount = parseFloat(servicePriceAmount);
    if (isNaN(amount) || amount <= 0) return;
    try {
      const updated = await submitServicePrice(job.id, amount, servicePriceNote);
      setJob(updated);
      setServicePriceAmount('');
      setServicePriceNote('');
      toast({ title: 'Service price submitted', description: 'The user will be notified to pay.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to submit price.', variant: 'destructive' });
    }
  };

  const handleSubmitMaterials = async () => {
    if (!job) return;
    if (materialsBuilder.length === 0) {
      toast({ title: 'No draft materials', description: 'Save materials first before submitting to user.' });
      return;
    }
    try {
      const updated = await submitMaterials(job.id, materialsBuilder);
      setJob(updated);
      setMaterialsBuilder([]);
      setAddMaterialsOpen(false);
      toast({ title: 'Materials submitted', description: 'The user can now review and pay.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to submit materials.', variant: 'destructive' });
    }
  };

  const handleAcceptUserSuggestion = async (suggestionId: string) => {
    if (!job) return;
    try {
      const updated = await acceptUserSuggestion(job.id, suggestionId);
      setJob(updated);
      toast({ title: 'Suggestion accepted' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to accept.', variant: 'destructive' });
    }
  };

  const handleRejectUserSuggestion = async (suggestionId: string) => {
    if (!job) return;
    try {
      const updated = await rejectUserSuggestion(job.id, suggestionId);
      setJob(updated);
      toast({ title: 'Suggestion rejected' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to reject.', variant: 'destructive' });
    }
  };

  const handleSendChat = async () => {
    if (!job || !chatMessage.trim()) return;
    try {
      const updated = await addChatMessage(job.id, chatMessage);
      setJob(updated);
      setChatMessage('');
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to send message.', variant: 'destructive' });
    }
  };

  const handleSendNote = async () => {
    if (!job || !noteMessage.trim()) return;
    try {
      const updated = await addJobNote(job.id, noteMessage, noteTitle.trim() || undefined);
      setJob(updated);
      setNoteTitle('');
      setNoteMessage('');
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to send note.', variant: 'destructive' });
    }
  };

  const handleMarkComplete = async () => {
    if (!job) return;
    try {
      const updated = await updateJobStatus(job.id, 'AWAITING_CONFIRMATION');
      setJob(updated);
      toast({ title: 'Marked as complete', description: 'Waiting for user confirmation.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    if (!job || !cancelReason) return;
    try {
      const result = await cancelJob(job.id, cancelReason, cancelDetails);
      setJob(result.job);
      setCancelOpen(false);
      toast({ title: 'Job cancelled', description: `Refund of ${formatCurrency(result.refundAmount)} will be processed.` });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to cancel job.', variant: 'destructive' });
    }
  };

  const handleSaveRequirements = async () => {
    if (!job) return;
    try {
      const updated = await updateProviderRequirements(job.id, {
        measurements: Object.keys(editMeasurements).length > 0 ? editMeasurements : undefined,
        requirementNotes: editRequirementNotes || undefined,
      });
      setJob(updated);
      setEditRequirementsOpen(false);
      setEditMeasurements({});
      setEditRequirementNotes('');
      toast({ title: 'Requirements updated', description: 'Changes will be visible to the user.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update requirements.', variant: 'destructive' });
    }
  };

  const effectiveMeasurements = job
    ? { ...job.measurements, ...job.providerAdjustedRequirements?.measurements }
    : null;
  const requirementNotes = job?.providerAdjustedRequirements?.requirementNotes;
  const locationParts = job?.location
    ? [job.location.address, job.location.city, job.location.area, job.location.suburb].filter(Boolean)
    : [];
  const fullAddress = locationParts.join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const materialCards = (job?.storeOrders && job.storeOrders.length > 0)
    ? job.storeOrders
    : [];
  const hasAnyMaterialPaid = materialCards.some(card => card.payment?.materialsPaid);
  const allMaterialsPaid = materialCards.length > 0 && materialCards.every(card => card.payment?.materialsPaid);
  const paidMaterialCards = materialCards.filter(card => card.payment?.materialsPaid);
  const pendingMaterialCards = materialCards.filter(card => !card.payment?.materialsPaid);
  const canEditMaterials = true;
  const getPendingOrderForAcceptedSuggestion = (suggestion: NonNullable<Job['userMaterialSuggestions']>[number]) => {
    const linked = pendingMaterialCards.find(card => card.sourceUserSuggestionId === suggestion.id);
    if (linked) return linked;
    return [...pendingMaterialCards].reverse().find(
      card =>
        card.storeId === suggestion.suggested.supplierId &&
        card.items.some(item => item.productId === suggestion.suggested.productId)
    );
  };
  const providerSuggestionsForDisplay = (job?.userMaterialSuggestions || []).filter(suggestion => {
    if (suggestion.status === 'pending') return true;
    if (suggestion.status === 'accepted') return !!getPendingOrderForAcceptedSuggestion(suggestion);
    return false;
  });
  const acceptedSuggestionOrderIds = new Set(
    providerSuggestionsForDisplay
      .filter(suggestion => suggestion.status === 'accepted')
      .map(suggestion => getPendingOrderForAcceptedSuggestion(suggestion)?.orderId)
      .filter((orderId): orderId is string => !!orderId)
  );
  const pendingOrderCards = pendingMaterialCards.filter(card => !acceptedSuggestionOrderIds.has(card.orderId));
  const hasProviderSuggestions = providerSuggestionsForDisplay.length > 0;
  const draftCardsByStore = materialsBuilder.reduce((acc, material) => {
    if (!acc[material.supplierId]) {
      acc[material.supplierId] = {
        storeName: material.supplierName,
        items: [] as MaterialLine[],
      };
    }
    acc[material.supplierId].items.push(material);
    return acc;
  }, {} as Record<string, { storeName: string; items: MaterialLine[] }>);
  const hasDraftMaterials = materialsBuilder.length > 0;
  const hasProviderPendingOrderContent =
    pendingOrderCards.length > 0 || hasDraftMaterials || canEditMaterials;
  const showProviderMaterialSubTabs = hasProviderPendingOrderContent && hasProviderSuggestions;

  const showMarkComplete = job ? ACTIVE_WORKFLOW_JOB_STATUSES.includes(job.status) : false;
  const showCancel = job
    ? ACTIVE_WORKFLOW_JOB_STATUSES.includes(job.status) || job.status === 'AWAITING_CONFIRMATION'
    : false;

  const getStatusBadge = (status: Job['status']) => (
    <Badge variant={getProviderStatusBadgeVariant(status)}>{getStandardizedStatusLabel(status)}</Badge>
  );

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
          <h2 className="text-xl font-semibold mb-2">Job not found</h2>
          <Button variant="outline" onClick={() => navigate('/provider/jobs')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/provider/jobs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">{job.categoryName}</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">#{job.id.slice(-8)}</p>
          </div>
          <div className="shrink-0">{getStatusBadge(job.status)}</div>
        </div>

        {/* Status Timeline */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between overflow-x-auto pb-2">
              {(() => {
                const view = getUserTimelineViewState(job);
                const isCancelled = view.terminal === 'cancelled';
                const isRejected = view.terminal === 'rejected';
                const isTerminal = isCancelled || isRejected;
                const pinIndex = view.pinIndex;
                const currentIdx = view.currentIdx;

                return USER_TIMELINE_STEPS.map((label, index, arr) => {
                  const insight = getTimelineStepInsight(job, index);
                  const isTerminalStep = isTerminal && index === pinIndex;
                  const isActive =
                    !isTerminal &&
                    job.status !== 'COMPLETED' &&
                    index === currentIdx;
                  const isPast = isTerminal
                    ? index < pinIndex
                    : job.status === 'COMPLETED' || index < currentIdx;

                  return (
                    <div key={label} className="flex items-center">
                      <div className="flex flex-col items-center min-w-[50px]">
                        <Popover
                          open={lockedTimelineStep === index || (lockedTimelineStep === null && hoveredTimelineStep === index)}
                          onOpenChange={(open) => {
                            if (!open && lockedTimelineStep === index) {
                              setLockedTimelineStep(null);
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onMouseEnter={() => lockedTimelineStep === null && setHoveredTimelineStep(index)}
                              onMouseLeave={() => lockedTimelineStep === null && setHoveredTimelineStep(null)}
                              onClick={() => {
                                setLockedTimelineStep((current) => (current === index ? null : index));
                                setHoveredTimelineStep(null);
                              }}
                              className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-transform hover:scale-105 focus:outline-none",
                                isPast ? "bg-success text-success-foreground" :
                                isTerminalStep ? "bg-destructive text-destructive-foreground ring-2 ring-destructive ring-offset-2" :
                                isActive ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2" :
                                "bg-muted text-muted-foreground"
                              )}
                            >
                              {isPast ? <Check className="h-4 w-4" /> : index + 1}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold">{insight.stepLabel}</p>
                              <p className="text-muted-foreground">{insight.nextAction}</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <span className={cn(
                          "text-[10px] mt-1 text-center leading-tight",
                          isTerminalStep ? "font-medium text-destructive" :
                          isActive ? "font-medium" : "text-muted-foreground"
                        )}>
                          {isTerminalStep
                            ? isCancelled
                              ? `Cancelled${view.terminalAt ? ` ${new Date(view.terminalAt).toLocaleDateString()}` : ''}`
                              : `Rejected${view.terminalAt ? ` ${new Date(view.terminalAt).toLocaleDateString()}` : ''}`
                            : label}
                        </span>
                      </div>
                      {index < arr.length - 1 && (
                        <div className={cn(
                          "w-6 sm:w-10 h-0.5 mx-1",
                          isTerminal ? (index < pinIndex ? "bg-success" : "bg-muted") :
                          (index < currentIdx ? "bg-success" : "bg-muted")
                        )} />
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Job Overview */}
        <div className="card-elevated p-6 space-y-4">
          <h2 className="font-semibold text-lg">Job Overview</h2>

          <div className="grid sm:grid-cols-2 gap-4 text-sm p-4 bg-muted/50 rounded-lg space-y-1 border border-primary/40">
            <div className="border-b-2 border-primary/20 pb-3">
            <p className="text-muted-foreground ">Customer</p>
              <span>{job.userName}</span>
            </div>
            {job.providerName && (
              <div className="border-b-2 border-primary/20 pb-3">
                <p className="text-muted-foreground">Selected Provider</p>
                <p className="font-medium">{job.providerName}</p>
              </div>
            )}
            <div className="border-b-2 border-primary/20 pb-3">
              <p className="text-muted-foreground ">Service Category</p>
              <p className="font-medium">{job.categoryName}</p>
            </div>
            <div className="border-b-2 border-primary/20 pb-3">
              <p className="text-muted-foreground ">Created</p>
              <p>{new Date(job.createdAt).toLocaleDateString()}</p>
            </div>
            {job.location && (
            <div className=" sm:border-b-0 border-b-2 border-primary/20 pb-3">
              <p className="text-muted-foreground text-sm">Location</p>
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                >
                  {fullAddress}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p>{fullAddress || '—'}</p>
              )}
              {job.location.notes && (
                <p className="text-xs text-muted-foreground mt-1">Notes: {job.location.notes}</p>
              )}
            </div>
          )}

          <div>
            <p className="text-muted-foreground text-sm">Description</p>
            <p className="text-sm">{job.description}</p>
          </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground text-sm">Requirements & Measurements</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setEditRequirementsOpen(true);
                  setEditMeasurements(job.providerAdjustedRequirements?.measurements || {});
                  setEditRequirementNotes(job.providerAdjustedRequirements?.requirementNotes || '');
                }}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            </div>
            {effectiveMeasurements && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2 border border-primary/40">
                {effectiveMeasurements.movingItems && effectiveMeasurements.movingItems.length > 0 ? (
                  effectiveMeasurements.movingItems.map(item => (
                    <div key={item.id} className="flex justify-between">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground">× {item.qty}</span>
                    </div>
                  ))
                ) : effectiveMeasurements.plumbingIssue ? (
                  <>
                    <div><span className="text-muted-foreground">Type:</span> {effectiveMeasurements.plumbingIssue.type}</div>
                    <div><span className="text-muted-foreground">Description:</span> {effectiveMeasurements.plumbingIssue.description}</div>
                  </>
                ) : (
                  Object.entries(effectiveMeasurements.values || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="capitalize text-muted-foreground">{k}</span>
                      <span>{v}</span>
                    </div>
                  ))
                )}
                {requirementNotes && (
                  <div className="pt-2 border-t border-border mt-2">
                    <p className="text-muted-foreground text-xs mb-1">Provider notes</p>
                    <p>{requirementNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {job.images.length > 0 && (
            <div>
              <p className="text-muted-foreground text-sm mb-2">Uploaded Images</p>
              <div className="flex gap-2 flex-wrap">
                {job.images.map((img, i) => (
                  <div key={i} className="h-20 w-20 rounded-lg bg-muted overflow-hidden">
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => (job.servicePrice || job.laborPaid) && setPaymentDetailsOpen(true)}
            onKeyDown={e => e.key === 'Enter' && (job.servicePrice || job.laborPaid) && setPaymentDetailsOpen(true)}
            className={cn(
              "p-4 rounded-lg relative cursor-pointer transition-colors hover:opacity-90",
              job.laborPaid ? "bg-green-500/30 border border-green-500/90" : "bg-primary/5"
            )}
          >
            {job.laborPaid && (
              <Badge className="absolute top-2 right-2 bg-green-900 text-white">Paid</Badge>
            )}
            {!job.laborPaid && job.servicePrice && (
              <Badge variant="secondary" className="absolute top-2 right-2">Unpaid</Badge>
            )}
            <p className="text-sm text-muted-foreground mb-1">Service Price</p>
            <p className="text-xl font-bold text-primary">
              {job.servicePrice ? formatCurrency(job.servicePrice.amount) : `${formatCurrency(job.laborEstimateRange.min)} - ${formatCurrency(job.laborEstimateRange.max)}`}
            </p>
            {job.servicePrice?.note && (
              <p className="text-xs text-muted-foreground mt-1">{job.servicePrice.note}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {job.laborPaid ? 'Paid' : 'Unpaid'}
            </p>
            {(job.servicePrice || job.laborPaid) && (
              <p className="text-xs text-primary mt-2">Click for payment details</p>
            )}
          </div>
          {(job.status === 'INSPECTED' || job.status === 'ASSIGNED') && !job.servicePrice && (
            <div className="p-4 border border-primary/40 rounded-lg space-y-4 ">
              <h3 className="font-medium">Submit Service Price</h3>
              <div className="flex gap-2 flex-wrap">
                <Input
                  type="number"
                  placeholder="Amount (e.g. 450)"
                  value={servicePriceAmount}
                  onChange={e => setServicePriceAmount(e.target.value)}
                  className="w-32"
                />
                <Input
                  placeholder="Note (optional)"
                  value={servicePriceNote}
                  onChange={e => setServicePriceNote(e.target.value)}
                  className="flex-1 min-w-[120px]"
                />
                <Button onClick={handleSubmitServicePrice} disabled={!servicePriceAmount || parseFloat(servicePriceAmount) <= 0}>
                  Submit Price
                </Button>
              </div>
            </div>
          )}

          {/*  Mark inspection & submit price */}
          {job.status === 'ASSIGNED' && (
            <div className="p-4 border border-primary/40 rounded-lg space-y-4">
              <h3 className="font-medium">Service Inspection</h3>
              <p className="text-sm text-muted-foreground">Mark inspection done, then submit your service price.</p>
              <Button onClick={handleMarkInspectionDone}>
                Mark Inspection Done
              </Button>
            </div>
          )}
          
        </div>

        {/* Materials */}
        <div className="card-elevated p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Package className="h-5 w-5" /> Materials
            </h2>
            {allMaterialsPaid && (
              <Badge className="bg-green-600 text-white">Paid</Badge>
            )}
          </div>
          {hasAnyMaterialPaid && (
            <p className="text-sm text-green-600 font-medium">
              User has completed material purchase for this job. You can proceed with the work.
            </p>
          )}
          {job.servicePrice && job.laborPaid && (
            <>
              {materialCards.length > 0 ? (
                <>
                  {paidMaterialCards.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground">Paid Materials</h3>
                      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                        {paidMaterialCards.map((card) => {
                          const total = card.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
                          return (
                            <div key={card.orderId} className="border border-green-500/60 bg-green-500/5 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{card.storeName || card.storeId}</span>
                                </div>
                                <Badge>Paid</Badge>
                              </div>
                              <div className="space-y-1 text-sm">
                                {card.items.map(item => (
                                  <div key={`${card.orderId}-${item.productId}`} className="flex justify-between">
                                    <span>{item.name} x{item.qty}</span>
                                    <span>{formatCurrency(item.qty * item.unitPrice, { decimals: 2 })}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t mt-2 pt-2 flex justify-between text-sm font-semibold">
                                <span>Subtotal</span>
                                <span>{formatCurrency(total, { decimals: 2 })}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">Read-only: paid material cycle is locked.</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {showProviderMaterialSubTabs && (
                    <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
                      <Button
                        size="sm"
                        variant={materialViewTab === 'orders' ? 'default' : 'ghost'}
                        className="h-8"
                        onClick={() => setMaterialViewTab('orders')}
                      >
                        Pending Orders
                      </Button>
                      <Button
                        size="sm"
                        variant={materialViewTab === 'suggestions' ? 'default' : 'ghost'}
                        className="h-8 gap-2"
                        onClick={() => setMaterialViewTab('suggestions')}
                      >
                        Suggestions
                        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                          {providerSuggestionsForDisplay.length}
                        </Badge>
                      </Button>
                    </div>
                  )}

                  {(!showProviderMaterialSubTabs || materialViewTab === 'orders') && (
                    <div className="space-y-3">
                      {(pendingOrderCards.length > 0 || hasDraftMaterials) && (
                        <h3 className="text-sm font-semibold text-muted-foreground">Pending Materials</h3>
                      )}
                      {pendingOrderCards.length > 0 && (
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                          {pendingOrderCards.map((card) => {
                            const total = card.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
                            return (
                              <div key={card.orderId} className="border border-primary/60 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{card.storeName || card.storeId}</span>
                                  </div>
                                  <Badge variant="secondary">Pending</Badge>
                                </div>
                                <div className="space-y-1 text-sm">
                                  {card.items.map(item => (
                                    <div key={`${card.orderId}-${item.productId}`} className="flex justify-between">
                                      <span>{item.name} x{item.qty}</span>
                                      <span>{formatCurrency(item.qty * item.unitPrice, { decimals: 2 })}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="border-t mt-2 pt-2 flex justify-between text-sm font-semibold">
                                  <span>Subtotal</span>
                                  <span>{formatCurrency(total, { decimals: 2 })}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {hasDraftMaterials && (
                        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                          {Object.entries(draftCardsByStore).map(([storeId, draft]) => {
                            const total = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
                            return (
                              <div key={`draft-${storeId}`} className="border border-amber-400/70 bg-amber-500/5 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{draft.storeName}</span>
                                  </div>
                                  <Badge variant="secondary">Saved locally</Badge>
                                </div>
                                <div className="space-y-1 text-sm">
                                  {draft.items.map(item => (
                                    <div key={`draft-${storeId}-${item.productId}`} className="flex justify-between">
                                      <span>{item.name} x{item.qty}</span>
                                      <span>{formatCurrency(item.qty * item.unitPrice, { decimals: 2 })}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="border-t mt-2 pt-2 flex justify-between text-sm font-semibold">
                                  <span>Subtotal</span>
                                  <span>{formatCurrency(total, { decimals: 2 })}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Not sent to the user yet. Use Submit Materials to User when ready.
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {canEditMaterials && (
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => setAddMaterialsOpen(true)} variant="outline">
                            Add / Edit Materials
                          </Button>
                          <Button onClick={handleSubmitMaterials} disabled={materialsBuilder.length === 0}>
                            Submit Materials to User
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {hasAnyMaterialPaid && (
                    <p className="text-xs text-muted-foreground mt-2">Materials paid for one or more stores. You can still add or edit new material items.</p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {showProviderMaterialSubTabs && (
                    <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
                      <Button
                        size="sm"
                        variant={materialViewTab === 'orders' ? 'default' : 'ghost'}
                        className="h-8"
                        onClick={() => setMaterialViewTab('orders')}
                      >
                        Pending Orders
                      </Button>
                      <Button
                        size="sm"
                        variant={materialViewTab === 'suggestions' ? 'default' : 'ghost'}
                        className="h-8 gap-2"
                        onClick={() => setMaterialViewTab('suggestions')}
                      >
                        Suggestions
                        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                          {providerSuggestionsForDisplay.length}
                        </Badge>
                      </Button>
                    </div>
                  )}
                  {(!showProviderMaterialSubTabs || materialViewTab === 'orders') && (
                    <div className="space-y-4">
                      {hasDraftMaterials && (
                        <>
                          <h3 className="text-sm font-semibold text-muted-foreground">Pending Materials</h3>
                          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                            {Object.entries(draftCardsByStore).map(([storeId, draft]) => {
                              const total = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
                              return (
                                <div key={`draft-${storeId}`} className="border border-amber-400/70 bg-amber-500/5 rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{draft.storeName}</span>
                                    </div>
                                    <Badge variant="secondary">Saved locally</Badge>
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    {draft.items.map(item => (
                                      <div key={`draft-${storeId}-${item.productId}`} className="flex justify-between">
                                        <span>{item.name} x{item.qty}</span>
                                        <span>{formatCurrency(item.qty * item.unitPrice, { decimals: 2 })}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="border-t mt-2 pt-2 flex justify-between text-sm font-semibold">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(total, { decimals: 2 })}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Not sent to the user yet. Use Submit Materials to User when ready.
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                      <p className="text-sm text-muted-foreground">Browse stores and add materials needed for this job.</p>
                      {canEditMaterials && (
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => setAddMaterialsOpen(true)} variant="outline">
                            Add / Edit Materials
                          </Button>
                          <Button onClick={handleSubmitMaterials} disabled={materialsBuilder.length === 0}>
                            Submit Materials to User
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {hasProviderSuggestions && (!showProviderMaterialSubTabs || materialViewTab === 'suggestions') && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <h3 className="font-medium">User Suggestions</h3>
                  {providerSuggestionsForDisplay.map(s => (
                    <div key={s.id} className="p-3 bg-muted/50 rounded-lg mb-2 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{s.suggested.name} x{s.suggested.qty}</p>
                        {s.message && <p className="text-sm text-muted-foreground">{s.message}</p>}
                      </div>
                      {s.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleRejectUserSuggestion(s.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                          <Button size="sm" onClick={() => handleAcceptUserSuggestion(s.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary">Accepted - waiting for user payment</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {(!job.servicePrice || !job.laborPaid) && (
            <p className="text-sm text-muted-foreground">Submit service price and wait for user payment before adding materials.</p>
          )}
        </div>

        {/* Communication */}
        <div className="card-elevated p-6 space-y-4">
          <h2 className="font-semibold text-lg">Communication</h2>
          <div className="flex border-b border-border">
            <button
              onClick={() => setCommTab('messages')}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                commTab === 'messages' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Messages
            </button>
            <button
              onClick={() => setCommTab('notes')}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                commTab === 'notes' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Job Notes
            </button>
          </div>

          {commTab === 'messages' && (
            <>
              <div className="max-h-64 overflow-y-auto space-y-3">
                {job.chat.length > 0 ? job.chat.map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[80%] p-3 rounded-lg text-sm",
                      msg.authorId === user?.id ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    <p className="text-xs font-medium mb-1 opacity-75">{msg.authorName}</p>
                    <p>{msg.message}</p>
                    <p className="text-xs opacity-50 mt-1">{new Date(msg.createdAt).toLocaleString()}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No messages yet.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={chatMessage}
                  onChange={e => setChatMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                />
                <Button size="icon" onClick={handleSendChat} disabled={!chatMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {commTab === 'notes' && (
            <>
              <div className="space-y-4 p-3 border rounded-lg bg-muted/30">
                <Input
                  placeholder="Note title (optional)"
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                />
                <Textarea
                  placeholder="Add a note..."
                  value={noteMessage}
                  onChange={e => setNoteMessage(e.target.value)}
                  rows={3}
                />
                <Button onClick={handleSendNote} disabled={!noteMessage.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-3">
                {job.jobNotes.length > 0 ? job.jobNotes.map(note => (
                  <div
                    key={note.id}
                    className="p-3 rounded-lg text-sm bg-muted/50 border"
                  >
                    {note.title && <p className="font-medium mb-1">{note.title}</p>}
                    <p className="text-muted-foreground">{note.message}</p>
                    <p className="text-xs opacity-50 mt-1">{note.authorName} · {new Date(note.createdAt).toLocaleString()}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Action Buttons - Floating */}
        {(showMarkComplete || showCancel) && (
          <div className="flex gap-3 sticky bottom-4">
            {showMarkComplete && (
              <Button className="flex-1 h-12" onClick={handleMarkComplete}>
                <CheckCircle className="mr-2 h-5 w-5" /> Mark as Complete
              </Button>
            )}
            {showCancel && (
              <Button variant="destructive" className={showMarkComplete ? 'flex-1 h-12' : 'flex-1 h-12'} onClick={() => setCancelOpen(true)}>
                <XCircle className="mr-2 h-5 w-5" /> Cancel Job
              </Button>
            )}
          </div>
        )}

        {job.status === 'AWAITING_CONFIRMATION' && (
          <div className="card-elevated p-6 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Awaiting User Confirmation</h3>
            <p className="text-sm text-muted-foreground">The client needs to confirm the job is completed and provide a review.</p>
          </div>
        )}

        {/* Add Materials Modal */}
        <AddMaterialsModal
          open={addMaterialsOpen}
          onOpenChange={setAddMaterialsOpen}
          suppliers={suppliers}
          jobCategory={job.category}
          existingMaterials={materialsBuilder}
          onAddMaterials={(mats) => setMaterialsBuilder(mats)}
        />

        {/* Payment Details Modal */}
        <Dialog open={paymentDetailsOpen} onOpenChange={setPaymentDetailsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                Payment Details
              </DialogTitle>
              <DialogDescription>
                Service payment information. Sensitive details are masked for security.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {job.laborPaid && (job.servicePayment || job.servicePrice || legacyInvoice) ? (
                <>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-lg">
                      {formatCurrency(job.servicePayment?.amount ?? job.servicePrice?.amount ?? job.laborEstimateRange?.max ?? 0, { decimals: 2 })}
                    </span>
                  </div>
                  {(job.servicePayment || legacyInvoice) && (
                    <div className="space-y-2 text-sm">
                      {job.servicePayment && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Paid by</span>
                            <span>{job.servicePayment.paidBy}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Reference</span>
                            <span className="font-mono text-xs">{job.servicePayment.paymentRef}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Payment method</span>
                            <span className="flex items-center gap-1">
                              <CreditCard className="h-4 w-4" />
                              {job.servicePayment.maskedPaymentMethod}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment date</span>
                        <span>{new Date(job.servicePayment?.paidAt ?? legacyInvoice?.paidAt ?? '').toLocaleString()}</span>
                      </div>
                      {legacyInvoice?.cardLast4 && !job.servicePayment && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Payment method</span>
                          <span className="flex items-center gap-1">
                            <CreditCard className="h-4 w-4" />
                            **** **** **** {legacyInvoice.cardLast4}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className="bg-green-600">Paid</Badge>
                      </div>
                    </div>
                  )}
                </>
              ) : job.servicePrice ? (
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <p className="font-medium">Service price submitted</p>
                  <p className="text-2xl font-bold text-primary mt-2">{formatCurrency(job.servicePrice.amount, { decimals: 2 })}</p>
                  {job.servicePrice.note && <p className="text-sm text-muted-foreground mt-2">{job.servicePrice.note}</p>}
                  <p className="text-sm text-muted-foreground mt-4">Awaiting user payment</p>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Requirements Dialog */}
        <Dialog open={editRequirementsOpen} onOpenChange={setEditRequirementsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Requirements & Measurements</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Measurement values (e.g. area: 25)</label>
                <Input
                  placeholder="area=25, length=10..."
                  value={
                    editMeasurements.values
                      ? Object.entries(editMeasurements.values).map(([k, v]) => `${k}=${v}`).join(', ')
                      : ''
                  }
                  onChange={e => {
                    const pairs = e.target.value.split(',').map(s => s.trim());
                    const values: Record<string, number> = {};
                    for (const p of pairs) {
                      const [k, v] = p.split('=').map(s => s.trim());
                      if (k && v && !isNaN(parseFloat(v))) values[k] = parseFloat(v);
                    }
                    setEditMeasurements(prev => ({ ...prev, values: Object.keys(values).length ? values : undefined }));
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Requirement notes (inspection-corrected)</label>
                <Textarea
                  placeholder="Add notes about dimensions, quantities, or work requirements..."
                  value={editRequirementNotes}
                  onChange={e => setEditRequirementNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRequirementsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRequirements}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Cancel Job
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Reason</label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduling_conflict">Scheduling conflict</SelectItem>
                    <SelectItem value="unable_to_complete">Unable to complete work</SelectItem>
                    <SelectItem value="client_unresponsive">Client unresponsive</SelectItem>
                    <SelectItem value="safety_concern">Safety concern</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Details (optional)</label>
                <Textarea
                  value={cancelDetails}
                  onChange={e => setCancelDetails(e.target.value)}
                  placeholder="Provide more context..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Job</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason}>Cancel Job</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
