import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  getJobById, 
  addChatMessage, 
  cancelJob,
  confirmJobCompletion,
  payForStoreMaterials,
  payLabor,
  setStoreDeliveryOption,
  approveStoreDeliveryRequest,
  deleteJob,
  addUserMaterialSuggestion,
  getLaborInvoiceByJobId,
  acceptProposedPrice,
} from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { MeasurementCard } from '@/components/measurements/MeasurementCard';
import { getSavedCards } from '@/lib/api/payments';
import { getSuppliers } from '@/lib/api/suppliers';
import { Job, SavedCard, MaterialLine, Supplier, DeliveryProvider } from '@/types';
import { JobCancellationDialog } from '@/components/jobs/JobCancellationDialog';
import { JobCompletionDialog } from '@/components/jobs/JobCompletionDialog';
import { MaterialPaymentSection } from '@/components/jobs/MaterialPaymentSection';
import { SuggestAlternativeMaterialsModal } from '@/components/jobs/SuggestAlternativeMaterialsModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProviderDetailModal } from '@/components/providers/ProviderDetailModal';
import { getProviderById } from '@/lib/api/providers';
import { Provider } from '@/types';
import { getDeliveryProviders } from '@/lib/api/specials';
import { 
  ArrowLeft, 
  Send, 
  MessageSquare, 
  FileText, 
  Clock, 
  CheckCircle,
  User,
  XCircle,
  Check,
  X,
  Ban,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getUserLaborGross } from '@/lib/jobUtils';
import { USER_TIMELINE_STEPS, getUserTimelineViewState } from '@/lib/userJobTimeline';
import { getStandardizedStatusLabel, getUnifiedTimelineStepIndex } from '@/lib/jobStatusMapping';
import { getTimelineStepInsight } from '@/lib/jobTimelineInsights';

export default function JobDetail() {
  const { id } = useParams();
  const jobId = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const syncJobsAfterMutation = useCallback(async () => {
    if (!jobId) return;
    await queryClient.refetchQueries({ queryKey: queryKeys.jobs.detail(jobId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
  }, [jobId, queryClient]);

  const {
    data: job,
    isLoading,
    isError,
    error: jobError,
  } = useQuery({
    queryKey: queryKeys.jobs.detail(jobId),
    queryFn: () => getJobById(jobId),
    enabled: Boolean(jobId),
  });
  const [newMessage, setNewMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'messages'>('details');
  const [suggestMaterialsOpen, setSuggestMaterialsOpen] = useState(false);
  const [payLaborModalOpen, setPayLaborModalOpen] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProvider[]>([]);
  const [deliveryProvidersError, setDeliveryProvidersError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [addMaterialsOpen, setAddMaterialsOpen] = useState(false);
  const [deleteMaterialOpen, setDeleteMaterialOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<MaterialLine | null>(null);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);
  const [lockedTimelineStep, setLockedTimelineStep] = useState<number | null>(null);
  const [hoveredTimelineStep, setHoveredTimelineStep] = useState<number | null>(null);
  const [serviceInvoiceOpen, setServiceInvoiceOpen] = useState(false);
  const [legacyInvoice, setLegacyInvoice] = useState<{ paidAt: string; cardLast4?: string } | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isMessageSending, setIsMessageSending] = useState(false);

  useEffect(() => {
    if (serviceInvoiceOpen && job?.laborPaid && !job.servicePayment) {
      getLaborInvoiceByJobId(job.id).then(invoice => {
        if (invoice) setLegacyInvoice({ paidAt: invoice.paidAt, cardLast4: invoice.cardLast4 });
      });
    } else {
      setLegacyInvoice(null);
    }
  }, [serviceInvoiceOpen, job?.id, job?.laborPaid, job?.servicePayment]);

  const loadSuppliers = useCallback(async () => {
    try {
      const supplierData = await getSuppliers();
      setSuppliers(supplierData);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load suppliers.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadDeliveryProviders = useCallback(async () => {
    try {
      const providers = await getDeliveryProviders();
      setDeliveryProviders(providers);
      setDeliveryProvidersError(null);
    } catch (error) {
      setDeliveryProviders([]);
      setDeliveryProvidersError(
        error instanceof Error ? error.message : 'Delivery providers are unavailable.'
      );
    }
  }, []);

  useEffect(() => {
    if (!isError || !jobError) return;
    console.error('Failed to load job:', jobError);
    toast({
      title: 'Error',
      description: jobError instanceof Error ? jobError.message : 'Failed to load job details.',
      variant: 'destructive',
    });
  }, [isError, jobError, toast]);

  useEffect(() => {
    if (!job?.providerId) {
      setProvider(null);
      return;
    }
    let cancelled = false;
    void getProviderById(job.providerId)
      .then((providerData) => {
        if (!cancelled && providerData) setProvider(providerData);
      })
      .catch((err) => {
        if (!cancelled) {
          toast({
            title: 'Error',
            description: err instanceof Error ? err.message : 'Failed to load provider details.',
            variant: 'destructive',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job?.providerId, toast]);

  const loadCards = useCallback(async () => {
    if (!user) return;
    try {
      const cards = await getSavedCards(user.id);
      setSavedCards(cards);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load saved cards.',
        variant: 'destructive',
      });
    }
  }, [toast, user]);

  useEffect(() => {
    if (jobId) {
      void loadCards();
      void loadSuppliers();
      void loadDeliveryProviders();
    }
  }, [jobId, loadCards, loadDeliveryProviders, loadSuppliers]);

  useEffect(() => {
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key?.includes('jobs') && jobId) {
        void queryClient.refetchQueries({ queryKey: queryKeys.jobs.detail(jobId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      }
    };
    window.addEventListener('storage', handleStorageUpdate);
    return () => window.removeEventListener('storage', handleStorageUpdate);
  }, [jobId, queryClient]);

  const handleSendMessage = async () => {
    if (!job || !newMessage.trim() || isMessageSending) return;
    setIsMessageSending(true);
    try {
      await addChatMessage(job.id, newMessage);
      await syncJobsAfterMutation();
      setNewMessage('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send message.',
        variant: 'destructive',
      });
    } finally {
      setIsMessageSending(false);
    }
  };

  const handlePayLabor = async (cardId: string, cvc: string) => {
    if (!job || !user || isActionPending) return;
    setIsActionPending(true);
    try {
      const selectedCard = savedCards.find(c => c.id === cardId);
      await payLabor(job.id, user.id, cardId, selectedCard?.last4 || '****');
      await syncJobsAfterMutation();
      setPayLaborModalOpen(false);
      toast({ title: 'Service paid', description: 'Your labor payment has been processed.' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process payment.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSuggestMaterial = async (suggested: MaterialLine, message: string) => {
    if (!job) return;
    try {
      await addUserMaterialSuggestion(job.id, suggested, message);
      await syncJobsAfterMutation();
      toast({ title: 'Suggestion sent', description: 'Your alternative material suggestion has been sent to the provider.' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send suggestion.',
        variant: 'destructive',
      });
    }
  };

  const handleCancelJob = async (reason: string, details: string) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      const { refundAmount } = await cancelJob(job.id, reason, details);
      await syncJobsAfterMutation();
      setCancelDialogOpen(false);
      toast({ 
        title: 'Job Cancelled', 
        description: `Your job has been cancelled. Refund of ${formatCurrency(refundAmount, { decimals: 2 })} will be processed.` 
      });
      navigate('/user/jobs');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel job.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleConfirmCompletion = async (rating: number, review: string) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await confirmJobCompletion(job.id, rating, review);
      await syncJobsAfterMutation();
      setCompletionDialogOpen(false);
      toast({ 
        title: 'Job Completed!', 
        description: 'Thank you for your review. Payment has been released to the provider.' 
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to complete job.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePayForStore = async (
    supplierId: string,
    cardId: string,
    cardLast4: string,
    options?: {
      deliveryType: 'SELF' | 'STORE' | 'PROVIDER';
      deliveryFee: number;
      deliveryProviderId?: string;
      orderId?: string;
    }
  ) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await payForStoreMaterials(
        job.id,
        supplierId,
        cardId,
        cardLast4,
        options
      );
      await syncJobsAfterMutation();
      toast({ 
        title: 'Materials paid', 
        description: 'Materials paid. Pay for delivery when approved in Order Details.' 
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process payment.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSelectDeliveryOption = async (
    storeId: string,
    params: {
      deliveryType: 'SELF' | 'STORE' | 'PROVIDER';
      deliveryFee: number;
      deliveryProviderId?: string;
      orderId?: string;
    }
  ) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await setStoreDeliveryOption(job.id, storeId, params);
      await syncJobsAfterMutation();
      toast({
        title: 'Delivery option selected',
        description: 'Your delivery preference has been saved for this store.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save delivery option.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSimulateProviderApproval = async (storeId: string) => {
    if (!job) return;
    try {
      await approveStoreDeliveryRequest(job.id, storeId);
      await syncJobsAfterMutation();
      toast({
        title: 'Delivery approved',
        description: 'Your delivery provider has approved the request.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to simulate provider approval.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteJob = async () => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await deleteJob(job.id);
      queryClient.removeQueries({ queryKey: queryKeys.jobs.detail(jobId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      toast({ 
        title: 'Job Deleted', 
        description: 'The job has been removed from your list.' 
      });
      navigate('/user/jobs');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete job.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const openDeleteMaterialDialog = (material: MaterialLine) => {
    setMaterialToDelete(material);
    setDeleteMaterialOpen(true);
  };

  const getStatusBadge = (status: Job['status']) => {
    const label = getStandardizedStatusLabel(status);
    if (status === 'CANCELLED' || status === 'REJECTED') {
      return (
        <Badge className="inline-flex items-center gap-1 bg-red-100 text-red-800">
          <XCircle className="h-3 w-3" />
          {label}
        </Badge>
      );
    }
    const idx = getUnifiedTimelineStepIndex(status);
    const stepClasses: Record<number, string> = {
      0: 'bg-yellow-100 text-yellow-800',
      1: 'bg-blue-100 text-blue-800',
      2: 'bg-amber-100 text-amber-800',
      3: 'bg-purple-100 text-purple-800',
      4: 'bg-amber-100 text-amber-800',
      5: 'bg-green-100 text-green-800',
    };
    const StepIcon =
      idx === 0 ? Clock : idx === 3 ? Clock : CheckCircle;
    return (
      <Badge className={cn('inline-flex items-center gap-1', stepClasses[idx] ?? stepClasses[0])}>
        <StepIcon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  const materialsTotal = (job?.materials || []).reduce((sum, m) => sum + (m.qty * m.unitPrice), 0) || 0;
  const laborTotal = job ? getUserLaborGross(job) : 0;
  const effectiveMeasurements = job
    ? { ...job.measurements, ...job.providerAdjustedRequirements?.measurements }
    : null;
  const hasMaterialsPaid = job?.materialPayments?.some(p => p.status === 'paid') || false;

  // Infer completion readiness from provider-authored notes
  const providerMarkedComplete = job?.status === 'IN_PROGRESS' && 
    job?.jobNotes?.some(n => n.message.toLowerCase().includes('completed') || n.message.toLowerCase().includes('finished'));

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
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
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">{job.categoryName}</h1>
                {getStatusBadge(job.status)}
              </div>
              <p className="text-sm text-muted-foreground sm:text-base">Job #{job.id.slice(-8)}</p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            {job.status === 'CANCELLED' && (
              <Button 
                variant="outline" 
                size="sm"
                className="h-9 flex-1 whitespace-nowrap text-muted-foreground border-muted-foreground hover:bg-accent/70 sm:flex-initial"
                onClick={() => setDeleteJobOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Job
              </Button>
            )}
            {job.status !== 'COMPLETED' && job.status !== 'CANCELLED' && (
              <Button 
                variant="outline" 
                size="sm"
                className="h-9 flex-1 whitespace-nowrap text-muted-foreground border-muted-foreground hover:bg-accent/70 sm:flex-initial"
                onClick={() => setCancelDialogOpen(true)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancel Job
              </Button>
            )}
            {providerMarkedComplete && job.status === 'IN_PROGRESS' && (
              <Button 
                className="btn-accent h-9 flex-1 whitespace-nowrap sm:flex-initial"
                onClick={() => setCompletionDialogOpen(true)}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Confirm Completion
              </Button>
            )}
          </div>
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

        {/* Revised quote from provider */}
        {!job.laborPaid && job.proposedLaborPrice && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Revised service quote</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your provider suggested a new labor price. Accept it to update the invoice and pay.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(job.proposedLaborPrice.amount, { decimals: 2 })}
                </p>
                {job.proposedLaborPrice.reason ? (
                  <p className="text-sm text-muted-foreground mt-2">{job.proposedLaborPrice.reason}</p>
                ) : null}
              </div>
              <Button
                className="btn-accent"
                disabled={isActionPending}
                onClick={async () => {
                  if (!job) return;
                  setIsActionPending(true);
                  try {
                    await acceptProposedPrice(job.id);
                    await syncJobsAfterMutation();
                    toast({
                      title: 'Quote accepted',
                      description: 'You can pay the updated service price below.',
                    });
                  } catch (error) {
                    toast({
                      title: 'Error',
                      description: error instanceof Error ? error.message : 'Could not accept quote.',
                      variant: 'destructive',
                    });
                  } finally {
                    setIsActionPending(false);
                  }
                }}
              >
                Accept revised quote
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Service Price Section */}
        {!job.laborPaid &&
          !job.proposedLaborPrice &&
          (job.servicePrice || job.status === 'SERVICE_PRICE_SUBMITTED') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service Price</CardTitle>
              <p className="text-sm text-muted-foreground">
                {job.requiresInspection === false
                  ? 'Provider has set the labor price. Pay to proceed.'
                  : 'Provider has set the labor price after inspection. Pay to proceed.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                <div>
                  <p className="text-2xl font-bold text-primary">
                    R{(job.servicePrice?.amount ?? job.laborEstimateRange.max).toFixed(2)}
                  </p>
                  {job.servicePrice?.note && (
                    <p className="text-sm text-muted-foreground mt-1">{job.servicePrice.note}</p>
                  )}
                </div>
                <Button className="btn-accent" onClick={() => setPayLaborModalOpen(true)}>
                  Pay Service
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {job.laborPaid && job.servicePrice && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service Price</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">{formatCurrency(getUserLaborGross(job), { decimals: 2 })}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setServiceInvoiceOpen(true)}>
                    View Invoice
                  </Button>
                  <Badge className="bg-success text-success-foreground">Paid</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Material Payment Section */}
        <MaterialPaymentSection
          job={job}
          userSuggestions={job.userMaterialSuggestions || []}
          savedCards={savedCards}
          deliveryProviders={deliveryProviders}
          deliveryProvidersError={deliveryProvidersError}
          onPayForStore={handlePayForStore}
          onSuggestAlternatives={() => setSuggestMaterialsOpen(true)}
          suppliers={suppliers}
          onSelectDeliveryOption={handleSelectDeliveryOption}
          onSimulateProviderApproval={handleSimulateProviderApproval}
          onViewStoreOrder={(orderId) => navigate(`/user/orders/${orderId}`)}
        />

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-4">
            {[
              { id: 'details', label: 'Details', icon: FileText },
              { id: 'notes', label: 'Job Notes', icon: MessageSquare },
              { id: 'messages', label: 'Messages', icon: MessageSquare },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'details' | 'notes' | 'messages')}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 border-b-2 -mb-px transition-colors",
                  activeTab === tab.id 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'details' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Job Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-b-2 border-primary/20 pb-3">
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p>{job.description}</p>
                </div>
                {job.images.length > 0 && (
                  <div className="border-b-2 border-primary/20 pb-3">
                    <p className="text-sm text-muted-foreground mb-2">Photos</p>
                    <div className="flex flex-wrap gap-2">
                      {job.images.map((img, i) => (
                        <a
                          key={`${img}-${i}`}
                          href={resolveUploadUrl(img)}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-24 w-24 overflow-hidden rounded-lg bg-muted"
                        >
                          <img src={resolveUploadUrl(img)} alt="" className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {job.location && (
                  <div className="border-b-2 border-primary/20 pb-3">
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p>{job.location.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {job.location.city}{job.location.area ? `, ${job.location.area}` : ''}
                    </p>
                    {job.location.notes && (
                      <p className="text-sm text-muted-foreground mt-1">Notes: {job.location.notes}</p>
                    )}
                    {job.location.coordinates && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {job.location.coordinates.lat.toFixed(5)}, {job.location.coordinates.lng.toFixed(5)}
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p>{new Date(job.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Updated</p>
                    <p>{new Date(job.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Provider Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Provider</CardTitle>
              </CardHeader>
              <CardContent>
                {job.providerName ? (
                  <div 
                    className="flex items-center gap-4 cursor-pointer hover:bg-muted/50 p-2 rounded-lg -m-2 transition-colors"
                    onClick={() => setProviderModalOpen(true)}
                  >
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{job.providerName}</p>
                      <p className="text-sm text-muted-foreground">Click to view profile</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No provider assigned yet</p>
                )}
              </CardContent>
            </Card>

            {/* Measurements / Requirements */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                {effectiveMeasurements?.cameraAssist && (
                  <div className="mb-4 space-y-2">
                    <p className="text-sm text-muted-foreground">Guided measurement</p>
                    <MeasurementCard measurement={effectiveMeasurements.cameraAssist} />
                  </div>
                )}
                {effectiveMeasurements?.movingItems && effectiveMeasurements.movingItems.length > 0 ? (
                  <div className="space-y-2">
                    {effectiveMeasurements.movingItems.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">× {item.qty}</span>
                      </div>
                    ))}
                  </div>
                ) : effectiveMeasurements?.plumbingIssue ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Issue Type</p>
                      <p>{effectiveMeasurements.plumbingIssue.type}</p>
                    </div>
                    {(effectiveMeasurements.plumbingIssue.description?.trim() || job.description) && (
                      <div>
                        <p className="text-sm text-muted-foreground">Details</p>
                        <p>
                          {effectiveMeasurements.plumbingIssue.description?.trim() || job.description}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(effectiveMeasurements?.values || {}).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-muted-foreground capitalize">{key}</p>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
                {job.providerAdjustedRequirements?.requirementNotes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-1">Provider notes</p>
                    <p className="text-sm">{job.providerAdjustedRequirements.requirementNotes}</p>
                  </div>
                )}
                <p className=" text-xs text-muted-foreground mt-4">
                  Source: {effectiveMeasurements?.source ?? job.measurements.source}
                </p>
              </CardContent>
            </Card>

            {/* Quote */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Materials</span>
                  <span>{formatCurrency(materialsTotal, { decimals: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labor / Service</span>
                  <span>
                    {job.servicePrice || (job.totalPrice != null && job.totalPrice > 0)
                      ? formatCurrency(getUserLaborGross(job), { decimals: 2 })
                      : `${formatCurrency(job.laborEstimateRange.min, { decimals: 2 })} – ${formatCurrency(job.laborEstimateRange.max, { decimals: 2 })}`}
                  </span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-primary">
                      {formatCurrency(materialsTotal + laborTotal, { decimals: 2 })}
                    </span>
                  </div>
                </div>
                {job.laborPaid && (
                  <p className="text-xs text-success mt-2">
                    {hasMaterialsPaid ? 'Service & Materials Paid' : 'Service Paid'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'notes' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Job Notes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Inspection findings and professional notes from your provider. Read-only.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {job.jobNotes.length > 0 ? (
                  job.jobNotes.map((note) => (
                    <div 
                      key={note.id}
                      className={cn(
                        "p-4 rounded-lg border",
                        note.authorRole === 'provider' ? "bg-muted/50" : "bg-primary/5"
                      )}
                    >
                      {note.title && <p className="font-medium text-sm mb-1">{note.title}</p>}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{note.authorName}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{note.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {job.requiresInspection === false
                      ? 'No notes yet. Your provider may add notes about the job.'
                      : 'No notes yet. Provider will add inspection notes.'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'messages' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Messages</CardTitle>
              <p className="text-sm text-muted-foreground">
                {job.requiresInspection === false
                  ? 'Message your provider about the job'
                  : 'Message your provider to arrange inspection or discuss the job'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
                {job.chat.length > 0 ? (
                  job.chat.map((msg) => (
                    <div 
                      key={msg.id}
                      className={cn(
                        "p-4 rounded-lg max-w-[80%]",
                        msg.authorRole === 'user' 
                          ? "bg-primary text-primary-foreground ml-auto" 
                          : "bg-muted"
                      )}
                    >
                      <p className="text-xs font-medium mb-1 opacity-75">{msg.authorName}</p>
                      <p className="text-sm">{msg.message}</p>
                      <p className={cn(
                        "text-xs mt-1",
                        msg.authorRole === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {new Date(msg.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">Start a conversation with your provider</p>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-border">
                <Textarea
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[60px]"
                />
                <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <JobCancellationDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleCancelJob}
        hasMaterialsPaid={hasMaterialsPaid}
        materialsAmount={materialsTotal}
        laborAmount={laborTotal}
      />

      <JobCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        onConfirm={handleConfirmCompletion}
        providerName={job.providerName || 'Provider'}
      />

      {provider && (
        <ProviderDetailModal
          provider={provider}
          open={providerModalOpen}
          onOpenChange={setProviderModalOpen}
        />
      )}

      {/* Suggest Alternative Materials Modal */}
      <SuggestAlternativeMaterialsModal
        open={suggestMaterialsOpen}
        onOpenChange={setSuggestMaterialsOpen}
        suppliers={suppliers}
        jobCategory={job.category}
        onSuggest={handleSuggestMaterial}
      />

      {/* Pay Labor Modal */}
      <PaymentModal
        open={payLaborModalOpen}
        onOpenChange={setPayLaborModalOpen}
        title="Pay Service / Labor"
        description="Pay the provider's labor fee to proceed with the job."
        amount={laborTotal}
        breakdown={[
          { label: 'Service / Labor', amount: laborTotal },
          { label: 'Total Due', amount: laborTotal, isBold: true },
        ]}
        savedCards={savedCards}
        onPaySuccess={handlePayLabor}
      />

      {/* Delete Job Dialog */}
      <DeleteJobDialog
        open={deleteJobOpen}
        onOpenChange={setDeleteJobOpen}
        onConfirm={handleDeleteJob}
        jobId={job.id}
      />

      {/* Service Invoice Modal */}
      <Dialog open={serviceInvoiceOpen} onOpenChange={setServiceInvoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Service Payment Invoice</DialogTitle>
            <DialogDescription>
              Secure payment details. Sensitive fields are masked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold">
                {formatCurrency(job.servicePayment?.amount ?? getUserLaborGross(job), { decimals: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment ref</span>
              <span className="font-mono text-xs">{job.servicePayment?.paymentRef ?? 'Legacy record'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment method</span>
              <span>{job.servicePayment?.maskedPaymentMethod ?? `**** **** **** ${legacyInvoice?.cardLast4 ?? '****'}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid at</span>
              <span>{new Date(job.servicePayment?.paidAt ?? legacyInvoice?.paidAt ?? job.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
