import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  openJobDispute,
  payForStoreMaterials,
  setStoreDeliveryOption,
  approveStoreDeliveryRequest,
  deleteJob,
  getLaborInvoiceByJobId,
  acceptProposedPrice,
  customerRejectMaterialBatch,
  dismissMaterialBatch,
  withdrawAcceptedUserSuggestion,
  purgeWithdrawnUserSuggestion,
  reselectJobProvider,
} from '@/lib/api/jobs';
import { getMaterialRequestsForJob } from '@/lib/api/materialRequests';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { getStores } from '@/lib/api/stores';
import { Job, SavedCard, MaterialLine, Supplier, DeliveryProvider } from '@/types';
import { JobCancellationDialog } from '@/components/jobs/JobCancellationDialog';
import { JobCompletionEvidenceDialog } from '@/components/jobs/JobCompletionEvidenceDialog';
import { JobDisputeDialog } from '@/components/jobs/JobDisputeDialog';
import { JobDetailPageSkeleton } from '@/components/common/loading';
import { useTransactionOverlay } from '@/hooks/useTransactionOverlay';
import { ConfirmationCountdown } from '@/components/jobs/ConfirmationCountdown';
import { MaterialPaymentSection } from '@/components/jobs/MaterialPaymentSection';
import { PaymentModal } from '@/components/payments/PaymentModal';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import { RejectedJobProviderSelectorDialog } from '@/components/jobs/RejectedJobProviderSelectorDialog';
import { JobWorkflowTimeline } from '@/components/jobs/JobWorkflowTimeline';
import { QuotationAttachmentCard } from '@/components/jobs/QuotationAttachmentCard';
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
  Star,
  User,
  XCircle,
  X,
  Ban,
  Trash2,
  UserSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getUserLaborGross, getQuoteMaterialsTotal, getQuoteMaterialsRefundTotal, jobHasRefundedMaterials } from '@/lib/jobUtils';
import { RefundSummaryLine, isJobRefunded, StagedRefundBreakdown } from '@/components/payments/RefundSummaryLine';
import { JobDeliveryRequirementsBlock } from '@/components/jobs/JobDeliveryRequirementsBlock';
import { JobCustomerRequirementsBlock } from '@/components/jobs/JobCustomerRequirementsBlock';
import { isDeliveryOrMovingJob } from '@/lib/courierCategories';
import {
  getCustomerQuoteTotal,
  getQuoteDeliveryLine,
  getQuoteLaborLine,
} from '@/lib/jobQuoteDisplay';
import {
  getCustomerCancelPreview,
  getCustomerCancelForfeitToastMessage,
  getCancelDisputeSubmittedToastMessage,
  isCourierJobCancellationBlocked,
} from '@/lib/jobCancellationPolicy';
import { getUserTimelineViewState } from '@/lib/userJobTimeline';
import { getMonotonicTimelineStepIndex, getJobDisplayStatusLabel } from '@/lib/jobProgressDisplay';
import { getCourierJobDisplayStatusLabel, getCourierTimelineStepIndex } from '@/lib/courierJobTimeline';
import { getTimelineStepInsight } from '@/lib/jobTimelineInsights';
import {
  COURIER_TIMELINE_STEPS,
  getCourierTimelineViewState,
  getCourierTimelineStepInsight,
} from '@/lib/courierJobTimeline';
import { getDeliveryRequestByJobId, acceptDeliveryRequestQuote } from '@/lib/api/deliveryRequests';
import { JobDeliverySection } from '@/components/delivery/JobDeliverySection';
import {
  categoryUsesMeasurementFields,
  getJobCategoryStep3Type,
  measurementsHaveStructuredSpecs,
} from '@/lib/jobSpecifications';
import { useMaterialOrderFulfillmentSocket } from '@/hooks/useMaterialOrderFulfillmentSocket';
import { useJobActivityIndicators } from '@/hooks/useJobActivityIndicators';
import { formatPersonDisplayName } from '@/lib/displayPersonName';
import { ActivityDot } from '@/components/ui/ActivityDot';
import { getSavedCards } from '@/lib/api/payments';
import { guardLoadedPaymentCards } from '@/lib/paymentCardGuard';

function addDaysIso(iso: string | null | undefined, days: number): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export default function JobDetail() {
  const { id } = useParams();
  const jobId = id ?? '';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const { messagesCount, markJobSectionRead } = useJobActivityIndicators();

  /** Keep hook order stable and aligned with provider JobDetail (socket + queries + state + effects). */
  useMaterialOrderFulfillmentSocket({ userId: user?.id, activeJobId: jobId });

  const syncJobsAfterMutation = useCallback(async () => {
    if (!jobId) return;
    await queryClient.refetchQueries({ queryKey: queryKeys.jobs.detail(jobId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.job(jobId) });
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
    staleTime: 4_000,
    refetchInterval: 8_000,
  });
  const { data: materialRequestsData } = useQuery({
    queryKey: queryKeys.materialRequests.job(jobId),
    queryFn: () => getMaterialRequestsForJob(jobId),
    enabled: Boolean(jobId),
    staleTime: 4_000,
    refetchInterval: 8_000,
  });
  const materialRequests = materialRequestsData ?? [];

  const { data: deliveryRequest } = useQuery({
    queryKey: ['delivery-request-by-job', jobId],
    queryFn: () => getDeliveryRequestByJobId(jobId),
    enabled: Boolean(jobId),
    staleTime: 4_000,
    refetchInterval: 8_000,
  });

  const [newMessage, setNewMessage] = useState('');
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'messages'>(
    initialTab === 'messages' || initialTab === 'notes' ? initialTab : 'details'
  );
  const [payLaborModalOpen, setPayLaborModalOpen] = useState(false);
  const [payCourierDeliveryModalOpen, setPayCourierDeliveryModalOpen] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProvider[]>([]);
  const [deliveryProvidersError, setDeliveryProvidersError] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [addMaterialsOpen, setAddMaterialsOpen] = useState(false);
  const [deleteMaterialOpen, setDeleteMaterialOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<MaterialLine | null>(null);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);
  const [reselectProviderOpen, setReselectProviderOpen] = useState(false);
  const [lockedTimelineStep, setLockedTimelineStep] = useState<number | null>(null);
  const [hoveredTimelineStep, setHoveredTimelineStep] = useState<number | null>(null);
  const [serviceInvoiceOpen, setServiceInvoiceOpen] = useState(false);
  const [legacyInvoice, setLegacyInvoice] = useState<{ paidAt: string; cardLast4?: string } | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isMessageSending, setIsMessageSending] = useState(false);

  useTransactionOverlay(isActionPending, 'Processing your request…');

  const loadStoresForJob = useCallback(async () => {
    if (!job) return;
    try {
      const list = await getStores({
        city: job.location?.city?.trim(),
        metro: job.location?.metro?.trim(),
        area: job.location?.area?.trim(),
        suburb: job.location?.suburb?.trim(),
        lat: job.location?.coordinates?.lat,
        lng: job.location?.coordinates?.lng,
      });
      setSuppliers(list);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load stores.',
        variant: 'destructive',
      });
    }
  }, [job, toast]);

  const loadDeliveryProviders = useCallback(async () => {
    try {
      const providers = await getDeliveryProviders({ city: job?.location?.city?.trim() });
      setDeliveryProviders(providers);
      setDeliveryProvidersError(null);
    } catch (error) {
      setDeliveryProviders([]);
      setDeliveryProvidersError(
        error instanceof Error ? error.message : 'Delivery providers are unavailable.'
      );
    }
  }, [job?.location?.city]);

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
    if (serviceInvoiceOpen && job?.laborPaid && !job.servicePayment) {
      getLaborInvoiceByJobId(job.id).then(invoice => {
        if (invoice) setLegacyInvoice({ paidAt: invoice.paidAt, cardLast4: invoice.cardLast4 });
      });
    } else {
      setLegacyInvoice(null);
    }
  }, [serviceInvoiceOpen, job?.id, job?.laborPaid, job?.servicePayment]);

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

  useEffect(() => {
    if (jobId) {
      void loadCards();
    }
  }, [jobId, loadCards]);

  useEffect(() => {
    if (!job) return;
    void loadStoresForJob();
    void loadDeliveryProviders();
  }, [job, loadStoresForJob, loadDeliveryProviders]);

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

  useEffect(() => {
    if (!jobId || !job) return;
    void markJobSectionRead(jobId, 'materials');
    void markJobSectionRead(jobId, 'general');
  }, [jobId, job?.id, markJobSectionRead]);

  useEffect(() => {
    if (!jobId || activeTab !== 'messages') return;
    void markJobSectionRead(jobId, 'messages');
  }, [jobId, activeTab, markJobSectionRead]);

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

  const handleCancelJob = async (reason: string, details: string) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      const { refundAmount, disputeOpened, disputeId } = await cancelJob(job.id, reason, details);
      await syncJobsAfterMutation();
      setCancelDialogOpen(false);
      if (disputeOpened && disputeId) {
        toast({
          title: 'Cancellation submitted',
          description: getCancelDisputeSubmittedToastMessage(),
        });
        navigate(`/user/cancellations/${disputeId}`);
        return;
      }
      const matsPaid =
        job.materialPayments?.some((p) => p.status === 'paid') ||
        (job.jobMaterialOrders ?? []).some((o) => {
          const ps = String(o.paymentStatus ?? '').toLowerCase();
          const fs = String(o.fulfillmentStatus ?? '').toUpperCase();
          return ps === 'paid' && fs !== 'CANCELLED';
        }) ||
        false;
      const forfeit =
        getCustomerCancelPreview(job, deliveryRequest ?? null, matsPaid).customerForfeits &&
        refundAmount === 0;
      toast({
        title: 'Job Cancelled',
        description: forfeit
          ? getCustomerCancelForfeitToastMessage(job)
          : refundAmount > 0
            ? `Your job has been cancelled. Refund of ${formatCurrency(refundAmount, { decimals: 2 })} will be processed.`
            : 'Your job has been cancelled.',
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

  const handleConfirmCompletion = async (
    rating: number,
    review: string,
    images: string[] = [],
    videos: string[] = []
  ) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await confirmJobCompletion(job.id, rating, review, { images, videos });
      await syncJobsAfterMutation();
      await queryClient.invalidateQueries({ queryKey: ['delivery-request-by-job', jobId] });
      setEvidenceDialogOpen(false);
      const isCourier = Boolean(job.courierFlow);
      toast({
        title: isCourier ? 'Delivery confirmed' : 'Job Completed!',
        description: isCourier
          ? 'Thanks for confirming receipt and rating your courier. Payment has been released.'
          : 'Thank you for your review. Payment has been released to the provider.',
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

  const handleOpenDispute = async (payload: {
    comment: string;
    requestedResolution: string;
    otherResolutionDetail?: string;
    images: string[];
    videos: string[];
  }) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await openJobDispute(job.id, payload);
      await syncJobsAfterMutation();
      setDisputeDialogOpen(false);
      toast({
        title: 'Dispute opened',
        description: 'Our team will review your case and contact you with updates.',
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to open dispute.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePayForStore = async (
    supplierId: string,
    paymentIntentId: string,
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
      await payForStoreMaterials(job.id, supplierId, paymentIntentId, options);
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
        title: params.deliveryType === 'PROVIDER' ? 'Delivery request sent' : 'Delivery option selected',
        description:
          params.deliveryType === 'PROVIDER'
            ? 'The delivery provider was notified. They will see the request in their Requests dashboard.'
            : 'Your delivery preference has been saved for this store.',
      });
    } catch (error) {
      toast({
        title: 'Could not save delivery option',
        description: error instanceof Error ? error.message : 'Failed to save delivery option.',
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

  const handleCustomerRejectMaterialBatch = async (orderId: string) => {
    if (!job) return;
    try {
      await customerRejectMaterialBatch(job.id, orderId);
      await syncJobsAfterMutation();
      toast({
        title: 'List rejected',
        description:
          'Your provider will see this as rejected. Tap “Remove listing” when you want it cleared from view.',
      });
    } catch (error) {
      toast({
        title: 'Could not reject',
        description:
          error instanceof Error ? error.message : 'Reject failed. Try refreshing the job.',
        variant: 'destructive',
      });
    }
  };

  const handleCustomerDismissMaterialBatch = async (orderId: string) => {
    if (!job) return;
    try {
      await dismissMaterialBatch(job.id, orderId);
      await syncJobsAfterMutation();
      toast({ title: 'Listing removed', description: 'That materials batch no longer appears on this job.' });
    } catch (error) {
      toast({
        title: 'Could not remove',
        description: error instanceof Error ? error.message : 'Remove failed.',
        variant: 'destructive',
      });
    }
  };

  const handleCustomerWithdrawSuggestion = async (suggestionId: string) => {
    if (!job) return;
    try {
      await withdrawAcceptedUserSuggestion(job.id, suggestionId);
      await syncJobsAfterMutation();
      toast({
        title: 'Suggestion withdrawn',
        description: 'You can remove the record anytime with Remove suggestion.',
      });
    } catch (error) {
      toast({
        title: 'Could not withdraw',
        description: error instanceof Error ? error.message : 'Withdraw failed.',
        variant: 'destructive',
      });
    }
  };

  const handleCustomerPurgeWithdrawnSuggestion = async (suggestionId: string) => {
    if (!job) return;
    try {
      await purgeWithdrawnUserSuggestion(job.id, suggestionId);
      await syncJobsAfterMutation();
      toast({ title: 'Suggestion cleared', description: 'Removed from this job\'s suggestion history.' });
    } catch (error) {
      toast({
        title: 'Could not remove',
        description: error instanceof Error ? error.message : 'Remove failed.',
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

  const handleReselectProvider = async (selectedProviderId: string) => {
    if (!job || isActionPending) return;
    setIsActionPending(true);
    try {
      await reselectJobProvider(job.id, selectedProviderId);
      await syncJobsAfterMutation();
      setReselectProviderOpen(false);
      toast({
        title: 'Request sent',
        description: 'Your job has been sent to the new provider for review.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Could not assign a new provider. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const formatRejectionReason = (reason?: string) =>
    reason ? reason.replace(/_/g, ' ') : '';

  const openDeleteMaterialDialog = (material: MaterialLine) => {
    setMaterialToDelete(material);
    setDeleteMaterialOpen(true);
  };

  const getStatusBadge = (current: Job) => {
    const label =
      current.courierFlow && deliveryRequest
        ? getCourierJobDisplayStatusLabel(current, deliveryRequest)
        : getJobDisplayStatusLabel(current);
    const status = current.status;
    if (status === 'CANCELLED' || status === 'REJECTED') {
      return (
        <Badge className="inline-flex items-center gap-1 bg-red-100 text-red-800">
          <XCircle className="h-3 w-3" />
          {label}
        </Badge>
      );
    }
    const idx = current.courierFlow
      ? getCourierTimelineStepIndex(current, deliveryRequest ?? null)
      : getMonotonicTimelineStepIndex(current);
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <JobDetailPageSkeleton />
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Job not found</h2>
          <Button onClick={() => navigate('/user/jobs')}>Go Back</Button>
        </div>
      </DashboardLayout>
    );
  }

  const materialsTotal = getQuoteMaterialsTotal(job);
  const materialsRefundTotal = getQuoteMaterialsRefundTotal(job);
  const hasRefundedMaterials = jobHasRefundedMaterials(job);
  const laborTotal = job.laborPaid
    ? getUserLaborGross(job)
    : job.proposedLaborPrice?.amount ?? job.servicePrice?.amount ?? getUserLaborGross(job);
  const quoteLaborLine = getQuoteLaborLine(job, deliveryRequest ?? null);
  const quoteDeliveryLine = getQuoteDeliveryLine(job, deliveryRequest ?? null);
  const quoteGrandTotal = getCustomerQuoteTotal(job, deliveryRequest ?? null);
  const effectiveMeasurements = {
    ...job.measurements,
    ...job.providerAdjustedRequirements?.measurements,
  };
  const hasMaterialsPaid =
    job.materialPayments?.some((p) => p.status === 'paid') ||
    (job.jobMaterialOrders ?? []).some((o) => {
      const ps = String(o.paymentStatus ?? '').toLowerCase();
      const fs = String(o.fulfillmentStatus ?? '').toUpperCase();
      return ps === 'paid' && fs !== 'CANCELLED';
    }) ||
    false;
  const cancelPreview = getCustomerCancelPreview(job, deliveryRequest ?? null, hasMaterialsPaid);
  const courierCancelBlocked = isCourierJobCancellationBlocked(job, deliveryRequest ?? null, 'customer');
  const showDeliveryRequirements = isDeliveryOrMovingJob(job);
  const providerReqText = job.providerAdjustedRequirements?.requirementText?.trim();
  const specsCardTitle = categoryUsesMeasurementFields(getJobCategoryStep3Type(job))
    ? 'Measurements & Requirements'
    : 'Requirements';
  const cancellationReasonText =
    (job.cancellationDetails && job.cancellationDetails.trim()) ||
    (job.cancellationReason && job.cancellationReason.trim()) ||
    'No reason provided';
  const jobDisputed = job.status === 'DISPUTED';
  const jobPaymentBlocked = job.status === 'CANCELLED' || job.status === 'REJECTED';
  const isCancellationReview =
    job.status === 'DISPUTED' &&
    (job.cancellationSource === 'customer_cancel' || job.cancellationSource === 'provider_cancel');

  const isCourierJob = Boolean(job.courierFlow);
  // Courier jobs reach the "awaiting confirmation" step via the linked delivery's
  // fulfillmentStatus, which is not always mirrored onto job.status. Let the customer
  // confirm (and rate the courier) once the courier has completed the delivery.
  const courierDeliveryAwaitingConfirmation =
    isCourierJob &&
    String(deliveryRequest?.fulfillmentStatus || '').toUpperCase() === 'COMPLETED' &&
    deliveryRequest?.deliveryConfirmed !== true &&
    job.completionConfirmedByUser !== true &&
    job.status !== 'COMPLETED' &&
    job.status !== 'CANCELLED' &&
    !jobDisputed;
  const awaitingUserConfirmation =
    job.status === 'AWAITING_CONFIRMATION' || courierDeliveryAwaitingConfirmation;
  const confirmationDeadlineAt =
    job.confirmationDeadlineAt ||
    (courierDeliveryAwaitingConfirmation
      ? addDaysIso(deliveryRequest?.updatedAt ?? deliveryRequest?.createdAt, 7)
      : null);
  const linkedJobDelivery =
    deliveryRequest && deliveryRequest.source === 'job_context' && !isCourierJob;
  const drStatusLower = String(deliveryRequest?.status || '').toLowerCase();
  const courierDeliveryPaid =
    ['paid', 'in_transit', 'completed'].includes(drStatusLower) ||
    deliveryRequest?.payment?.deliveryPaid === true ||
    job.laborPaid;
  const courierServiceAmount =
    deliveryRequest?.quotedFee ?? job.servicePrice?.amount ?? job.laborEstimateRange.max;
  const showCourierServiceCard =
    isCourierJob &&
    deliveryRequest &&
    !job.proposedLaborPrice &&
    !courierDeliveryPaid &&
    (job.servicePrice != null || drStatusLower === 'quoted' || drStatusLower === 'approved');
  const showRegularServiceCard =
    !isCourierJob &&
    !job.laborPaid &&
    !job.proposedLaborPrice &&
    (job.servicePrice || job.status === 'SERVICE_PRICE_SUBMITTED');
  const timelineView = isCourierJob
    ? getCourierTimelineViewState(job, deliveryRequest ?? null, materialRequests)
    : getUserTimelineViewState(job, materialRequests);

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/user/jobs')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">{job.categoryName}</h1>
                {getStatusBadge(job)}
              </div>
              <p className="text-sm text-muted-foreground sm:text-base">Job #{job.id.slice(-8)}</p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            {(job.status === 'CANCELLED' || job.status === 'REJECTED') && (
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
            {job.status !== 'COMPLETED' && job.status !== 'CANCELLED' && job.status !== 'REJECTED' && !courierCancelBlocked && (
              <Button 
                variant="outline" 
                size="sm"
                className="h-9 flex-1 whitespace-nowrap text-muted-foreground border-muted-foreground hover:bg-accent/70 sm:flex-initial"
                onClick={() => setCancelDialogOpen(true)}
                disabled={job.status === 'DISPUTED'}
                title={
                  job.status === 'DISPUTED'
                    ? 'This job is under review. Actions are disabled until the case is resolved.'
                    : undefined
                }
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancel Job
              </Button>
            )}
          </div>
        </div>

        {/* Status Timeline */}
        <JobWorkflowTimeline
          job={job}
          view={timelineView}
          variant="user"
          steps={isCourierJob ? COURIER_TIMELINE_STEPS : undefined}
          getStepInsight={(stepIndex) =>
            isCourierJob
              ? getCourierTimelineStepInsight(job, deliveryRequest ?? null, stepIndex)
              : getTimelineStepInsight(job, stepIndex, materialRequests)
          }
          cancellationReasonText={cancellationReasonText}
          lockedTimelineStep={lockedTimelineStep}
          setLockedTimelineStep={setLockedTimelineStep}
          hoveredTimelineStep={hoveredTimelineStep}
          setHoveredTimelineStep={setHoveredTimelineStep}
        />

        {isCourierJob && deliveryRequest ? (
          <JobDeliverySection
            job={job}
            deliveryRequest={deliveryRequest}
            variant="user"
            hideQuotePaymentActions
          />
        ) : null}

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

        {showCourierServiceCard && deliveryRequest ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service price & quotation</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your courier submitted a delivery quote. Accept it to proceed, then pay to start delivery.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <QuotationAttachmentCard
                jobId={job.id}
                serviceAmount={courierServiceAmount}
                fileName={job.quotationFileName}
                uploadedAt={job.quotationUploadedAt}
                serviceNote={job.servicePrice?.note}
              />
              <div className="flex flex-wrap justify-end gap-2">
                {drStatusLower === 'quoted' ? (
                  <Button
                    className="btn-accent"
                    disabled={isActionPending}
                    onClick={async () => {
                      setIsActionPending(true);
                      try {
                        await acceptDeliveryRequestQuote(deliveryRequest.id);
                        await queryClient.invalidateQueries({
                          queryKey: ['delivery-request-by-job', jobId],
                        });
                        await syncJobsAfterMutation();
                        toast({
                          title: 'Quote accepted',
                          description: 'You can pay for delivery below.',
                        });
                      } catch (error) {
                        toast({
                          title: 'Error',
                          description:
                            error instanceof Error ? error.message : 'Could not accept quote.',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsActionPending(false);
                      }
                    }}
                  >
                    Accept delivery quote
                  </Button>
                ) : null}
                {drStatusLower === 'approved' && !courierDeliveryPaid ? (
                  <Button
                    className="btn-accent"
                    disabled={jobPaymentBlocked}
                    onClick={() => {
                      if (jobPaymentBlocked) return;
                      if (!guardLoadedPaymentCards(savedCards, toast)) return;
                      setPayCourierDeliveryModalOpen(true);
                    }}
                  >
                    Pay service
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showRegularServiceCard && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service price & quotation</CardTitle>
              <p className="text-sm text-muted-foreground">
                {job.requiresInspection === false
                  ? 'Your provider submitted labour pricing. Review the amount and any attached quote, then pay to proceed.'
                  : 'Your provider submitted labour pricing after inspection. Review the amount and any attached quote, then pay to proceed.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <QuotationAttachmentCard
                jobId={job.id}
                serviceAmount={job.servicePrice?.amount ?? job.laborEstimateRange.max}
                fileName={job.quotationFileName}
                uploadedAt={job.quotationUploadedAt}
                serviceNote={job.servicePrice?.note}
              />
              <div className="flex justify-end">
                <Button
                  className="btn-accent"
                  disabled={jobPaymentBlocked}
                  onClick={() => {
                    if (jobPaymentBlocked) return;
                    if (!guardLoadedPaymentCards(savedCards, toast)) return;
                    setPayLaborModalOpen(true);
                  }}
                >
                  Pay service
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {job.laborPaid && job.servicePrice && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service price</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <QuotationAttachmentCard
                jobId={job.id}
                serviceAmount={getUserLaborGross(job)}
                fileName={job.quotationFileName}
                uploadedAt={job.quotationUploadedAt}
                serviceNote={job.servicePrice?.note}
              />
              {job.refundAmount != null && job.refundAmount > 0 && (
                <>
                  <RefundSummaryLine refundAmount={job.refundAmount} refundStatus={job.refundStatus} />
                  <StagedRefundBreakdown
                    immediateRefund={job.refundDetails?.immediateRefund ?? undefined}
                    pendingRefund={job.refundDetails?.pendingRefund ?? undefined}
                  />
                </>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setServiceInvoiceOpen(true)}>
                  View invoice
                </Button>
                {job.refundStatus === 'processed' || job.refundStatus === 'partial' ? (
                  <Badge variant="destructive">Refunded</Badge>
                ) : (
                  <Badge className="bg-success text-success-foreground">Paid</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {linkedJobDelivery && deliveryRequest ? (
          <JobDeliverySection
            job={job}
            deliveryRequest={deliveryRequest}
            variant="user"
            embedded
          />
        ) : null}

        {/* Material Payment Section */}
        {job.requiresMaterials !== false && !isCourierJob && (
          <MaterialPaymentSection
            job={job}
            materialRequests={materialRequests}
            userSuggestions={job.userMaterialSuggestions || []}
            savedCards={savedCards}
            deliveryProviders={deliveryProviders}
            deliveryProvidersError={deliveryProvidersError}
            onPayForStore={handlePayForStore}
            onSuggestAlternatives={() => navigate(`/user/jobs/${job.id}/suggest-materials`)}
            suppliers={suppliers}
            onSelectDeliveryOption={handleSelectDeliveryOption}
            onSimulateProviderApproval={handleSimulateProviderApproval}
            onViewStoreOrder={(orderId) => navigate(`/user/material-orders/${orderId}`)}
            onCustomerRejectMaterialBatch={handleCustomerRejectMaterialBatch}
            onDismissMaterialBatch={handleCustomerDismissMaterialBatch}
            onWithdrawAcceptedSuggestion={handleCustomerWithdrawSuggestion}
            onPurgeWithdrawnSuggestion={handleCustomerPurgeWithdrawnSuggestion}
          />
        )}

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
                {tab.id === 'messages' && messagesCount(jobId) > 0 && (
                  <ActivityDot count={messagesCount(jobId)} aria-label="Unread messages" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'details' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
            {/* Job Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Details</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 space-y-4">
                <div className="min-w-0 border-b-2 border-primary/20 pb-3">
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {job.description}
                  </p>
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
                  <div className="min-w-0 border-b-2 border-primary/20 pb-3">
                    <p className="text-sm text-muted-foreground">Location</p>
                    {job.location.address && (
                      <p className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{job.location.address}</p>
                    )}
                    <p className="text-sm text-muted-foreground break-words">
                      {job.location.city}{job.location.area ? `, ${job.location.area}` : ''}
                    </p>
                    {job.location.notes && (
                      <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        Notes: {job.location.notes}
                      </p>
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
              <CardContent className="space-y-4">
                {job.providerName ? (
                  <>
                  <div 
                    className="flex items-center gap-4 cursor-pointer hover:bg-muted/50 p-2 rounded-lg -m-2 transition-colors"
                    onClick={() => {
                      if (job.providerId) {
                        navigate(`/user/providers/${job.providerId}`, {
                          state: { selectedCategory: job.category },
                        });
                      } else setProviderModalOpen(true);
                    }}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                      {provider?.profileImage ? (
                        <img
                          src={resolveUploadUrl(provider.profileImage)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{job.providerName}</p>
                      {provider ? (
                        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-foreground font-medium tabular-nums">
                            <Star className="h-3.5 w-3.5 fill-accent text-accent shrink-0" aria-hidden />
                            {provider.rating.toFixed(1)}
                          </span>
                          <span>
                            {(provider.totalReviews ?? provider.reviews?.length ?? 0).toLocaleString()} review
                            {(provider.totalReviews ?? provider.reviews?.length ?? 0) === 1 ? '' : 's'}
                          </span>
                          <span className="text-muted-foreground">· View full profile</span>
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Click to view profile</p>
                      )}
                    </div>
                  </div>

                    {job.status === 'REJECTED' && (job.rejectionReason || job.rejectionDetails) ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                        <p className="text-sm font-medium text-destructive">Reason for rejection</p>
                        {job.rejectionReason ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatRejectionReason(job.rejectionReason)}
                          </p>
                        ) : null}
                        {job.rejectionDetails ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {job.rejectionDetails}
                          </p>
                        ) : null}
                        {job.rejectedAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Rejected on {new Date(job.rejectedAt).toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {job.status === 'REJECTED' && !job.courierFlow ? (
                      <Button
                        type="button"
                        className="btn-accent w-full"
                        onClick={() => setReselectProviderOpen(true)}
                      >
                        <UserSearch className="mr-2 h-4 w-4" />
                        Look for another provider
                      </Button>
                    ) : null}

                    {(awaitingUserConfirmation || jobDisputed) && (
                      <div className="space-y-3 border-t pt-4">
                        {jobDisputed ? (
                          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                            <Clock className="h-5 w-5 shrink-0 text-destructive mt-0.5" aria-hidden />
                            <div>
                              <p className="font-medium text-sm text-destructive">
                                {isCancellationReview ? 'Cancellation opened' : 'Dispute opened'}
                              </p>
                              <p className="text-sm text-muted-foreground mt-1">
                                {isCancellationReview
                                  ? 'EloFix is reviewing this cancellation. View updates in your Review Center.'
                                  : 'EloFix is reviewing this case. View updates in your Review Center.'}
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => {
                                  if (job.disputeId) {
                                    navigate(
                                      isCancellationReview
                                        ? `/user/cancellations/${job.disputeId}`
                                        : `/user/disputes/${job.disputeId}`
                                    );
                                  } else {
                                    navigate('/user/jobs?view=review');
                                  }
                                }}
                              >
                                View case
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                        <ConfirmationCountdown deadlineAt={confirmationDeadlineAt} />
                        <div className="flex flex-col gap-2 sm:flex-col">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            disabled={isActionPending || job.status === 'DISPUTED'}
                            title={
                              job.status === 'DISPUTED'
                                ? 'This job is under review. Actions are disabled until the case is resolved.'
                                : undefined
                            }
                            onClick={() => setDisputeDialogOpen(true)}
                          >
                            No, not complete
                          </Button>
                          <Button
                            type="button"
                            className="btn-accent flex-1"
                            disabled={isActionPending || job.status === 'DISPUTED'}
                            title={
                              job.status === 'DISPUTED'
                                ? 'This job is under review. Actions are disabled until the case is resolved.'
                                : undefined
                            }
                            onClick={() => setEvidenceDialogOpen(true)}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Yes, completed
                          </Button>
                        </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No provider assigned yet</p>
                )}
              </CardContent>
            </Card>

            {/* Measurements / Requirements */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{specsCardTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                {showDeliveryRequirements ? (
                  <JobDeliveryRequirementsBlock
                    job={job}
                    deliveryRequest={deliveryRequest ?? null}
                  />
                ) : (
                  <JobCustomerRequirementsBlock job={job} measurements={job.measurements} />
                )}
                {showDeliveryRequirements && providerReqText ? (
                  <div className="mt-4 min-w-0 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-1">Additional notes from provider</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {providerReqText}
                    </p>
                  </div>
                ) : null}
                {!showDeliveryRequirements && providerReqText ? (
                  <div className="mt-4 min-w-0 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-1">Provider-confirmed requirements</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {providerReqText}
                    </p>
                  </div>
                ) : null}
                {!showDeliveryRequirements &&
                effectiveMeasurements &&
                measurementsHaveStructuredSpecs(effectiveMeasurements) &&
                measurementsHaveStructuredSpecs(job.measurements) === false ? (
                  <div className="mt-4 min-w-0 pt-4 border-t border-border space-y-2">
                    <p className="text-sm text-muted-foreground mb-1">Updated measurements (provider)</p>
                    <JobCustomerRequirementsBlock
                      job={job}
                      measurements={{
                        ...job.measurements,
                        ...job.providerAdjustedRequirements?.measurements,
                      }}
                    />
                  </div>
                ) : null}
                {job.providerAdjustedRequirements?.requirementNotes && (
                  <div className="mt-4 min-w-0 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                      {job.providerAdjustedRequirements.requirementNotes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quote */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quote</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {hasRefundedMaterials
                    ? 'Cancelled material orders are excluded from the total; refunds show below (93% net to you).'
                    : 'Materials total includes all paid purchases on this job; cancelled store orders are excluded.'}
                </p>
                <div className="flex justify-between gap-3 min-w-0">
                  <span className="shrink-0 text-muted-foreground">Materials</span>
                  <span className="min-w-0 text-right font-medium tabular-nums">
                    {formatCurrency(materialsTotal, { decimals: 2 })}
                  </span>
                </div>
                {materialsRefundTotal > 0 && (
                  <RefundSummaryLine
                    refundAmount={materialsRefundTotal}
                    refundStatus="processed"
                    className="text-xs"
                  />
                )}
                {quoteDeliveryLine ? (
                  <div className="flex justify-between gap-3 min-w-0">
                    <span className="shrink-0 text-muted-foreground">{quoteDeliveryLine.label}</span>
                    <span className="min-w-0 text-right font-medium tabular-nums">{quoteDeliveryLine.amountText}</span>
                  </div>
                ) : null}
                {quoteLaborLine ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between gap-3 min-w-0">
                      <span className="shrink-0 text-muted-foreground">{quoteLaborLine.label}</span>
                      <span
                        className={cn(
                          'min-w-0 text-right font-medium tabular-nums',
                          quoteLaborLine.pendingAcceptance && 'text-amber-700 dark:text-amber-300'
                        )}
                      >
                        {quoteLaborLine.amountText}
                      </span>
                    </div>
                    {quoteLaborLine.hint ? (
                      <p className="text-xs text-muted-foreground text-right">{quoteLaborLine.hint}</p>
                    ) : null}
                  </div>
                ) : null}
                {(job.refundAmount ?? 0) > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between gap-3 min-w-0">
                      <span className="shrink-0 text-muted-foreground">Service refund</span>
                    </div>
                    <RefundSummaryLine refundAmount={job.refundAmount} refundStatus={job.refundStatus} />
                  </div>
                )}
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-primary">
                      {formatCurrency(quoteGrandTotal, { decimals: 2 })}
                    </span>
                  </div>
                </div>
                {job.laborPaid && (
                  <div className="mt-2 space-y-1">
                    {hasRefundedMaterials || isJobRefunded(job) ? (
                      <p className="text-xs text-destructive">
                        {hasRefundedMaterials && isJobRefunded(job)
                          ? 'Material and service refunds processed'
                          : hasRefundedMaterials
                            ? 'Material order cancelled — refund processed'
                            : 'Service refund processed'}
                      </p>
                    ) : (
                      <p className="text-xs text-success">
                        {hasMaterialsPaid ? 'Service & Materials Paid' : 'Service Paid'}
                      </p>
                    )}
                  </div>
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
                        <span className="font-medium text-sm">{formatPersonDisplayName(note.authorName)}</span>
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
                      <p className="text-xs font-medium mb-1 opacity-75">{formatPersonDisplayName(msg.authorName)}</p>
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
        laborAmount={job.laborPaid ? getUserLaborGross(job) : laborTotal}
        cancelPreview={cancelPreview}
      />

      <JobCompletionEvidenceDialog
        open={evidenceDialogOpen}
        onOpenChange={setEvidenceDialogOpen}
        jobId={job.id}
        loading={isActionPending}
        onSubmit={(rating, review, images, videos) =>
          void handleConfirmCompletion(rating, review, images, videos)
        }
      />

      <JobDisputeDialog
        open={disputeDialogOpen}
        onOpenChange={setDisputeDialogOpen}
        jobId={job.id}
        loading={isActionPending}
        onSubmit={(payload) => void handleOpenDispute(payload)}
      />

      {provider && (
        <ProviderDetailModal
          provider={provider}
          open={providerModalOpen}
          onOpenChange={setProviderModalOpen}
          selectedCategory={job.category}
        />
      )}

      <PaymentModal
        open={payLaborModalOpen}
        onOpenChange={setPayLaborModalOpen}
        title="Pay Service / Labor"
        description="Pay the provider's labor fee to proceed with the job."
        amount={
          job.proposedLaborPrice?.amount ?? job.servicePrice?.amount ?? laborTotal
        }
        kind="LABOR"
        jobId={job.id}
        breakdown={[
          {
            label: 'Service / Labor',
            amount: job.proposedLaborPrice?.amount ?? job.servicePrice?.amount ?? laborTotal,
          },
          {
            label: 'Total Due',
            amount: job.proposedLaborPrice?.amount ?? job.servicePrice?.amount ?? laborTotal,
            isBold: true,
          },
        ]}
      />

      {isCourierJob && deliveryRequest ? (
        <PaymentModal
          open={payCourierDeliveryModalOpen}
          onOpenChange={setPayCourierDeliveryModalOpen}
          title="Pay service"
          description="Complete payment so your courier can collect and deliver your materials."
          amount={courierServiceAmount}
          kind="DELIVERY_FEE"
          jobId={job.id}
          materialOrderId={deliveryRequest.materialOrderId}
          metadata={{ deliveryRequestId: deliveryRequest.id }}
          breakdown={[
            { label: 'Delivery fee', amount: courierServiceAmount },
            { label: 'Total due', amount: courierServiceAmount, isBold: true },
          ]}
        />
      ) : null}

      {/* Delete Job Dialog */}
      <DeleteJobDialog
        open={deleteJobOpen}
        onOpenChange={setDeleteJobOpen}
        onConfirm={handleDeleteJob}
        jobId={job.id}
      />

      {job.status === 'REJECTED' && !job.courierFlow ? (
        <RejectedJobProviderSelectorDialog
          open={reselectProviderOpen}
          onOpenChange={setReselectProviderOpen}
          job={job}
          loading={isActionPending}
          onConfirm={handleReselectProvider}
        />
      ) : null}

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
