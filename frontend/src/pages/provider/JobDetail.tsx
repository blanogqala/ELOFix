import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  getJobById,
  addJobNote,
  addChatMessage,
  cancelJob,
  updateJobStatus,
  markInspectionDone,
  submitServicePrice,
  acceptUserSuggestion,
  rejectUserSuggestion,
  updateProviderRequirements,
  getLaborInvoiceByJobId,
  proposeNewLaborPrice,
} from '@/lib/api/jobs';
import {
  getMaterialRequestsForJob,
  createMaterialRequestDraft,
  submitMaterialRequestPayload,
} from '@/lib/api/materialRequests';
import { Job, MaterialLine, Measurements } from '@/types';
import {
  ArrowLeft, User, Calendar, MessageSquare, Send, MapPin,
  XCircle, CheckCircle, Clock, AlertTriangle, DollarSign, X,
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
import { JobWorkflowTimeline } from '@/components/jobs/JobWorkflowTimeline';
import { MaterialsSection } from '@/components/materials/MaterialsSection';
import { Card, CardContent } from '@/components/ui/card';
import {
  getJobDisplayStatusLabel,
  getProviderJobBadgeVariantForJob,
} from '@/lib/jobProgressDisplay';
import { ACTIVE_WORKFLOW_JOB_STATUSES } from '@/lib/jobStatusMapping';
import {
  getProviderJobTimelineViewState,
  getProviderTimelineStepInsight,
} from '@/lib/providerJobTimeline';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { useMaterialOrderFulfillmentSocket } from '@/hooks/useMaterialOrderFulfillmentSocket';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { MeasurementCard } from '@/components/measurements/MeasurementCard';

function getMeasurementValue(values: Record<string, number> | undefined, key: 'area' | 'length' | 'width'): number | undefined {
  if (!values) return undefined;
  const exact = values[key];
  if (typeof exact === 'number' && Number.isFinite(exact)) return exact;
  const fallback = Object.entries(values).find(([k, v]) => k.toLowerCase() === key && Number.isFinite(Number(v)));
  if (!fallback) return undefined;
  return Number(fallback[1]);
}

function formatMeasurementRows(values: Record<string, number> | undefined): Array<{ label: string; value: string }> {
  if (!values) return [];
  const area = getMeasurementValue(values, 'area');
  const length = getMeasurementValue(values, 'length');
  const width = getMeasurementValue(values, 'width');
  const rows: Array<{ label: string; value: string }> = [];

  if (area !== undefined) rows.push({ label: 'Area', value: `${area} m²` });
  if (length !== undefined) rows.push({ label: 'Length', value: `${length} m` });
  if (width !== undefined) rows.push({ label: 'Width', value: `${width} m` });

  for (const [k, v] of Object.entries(values)) {
    const key = k.toLowerCase();
    if (key === 'area' || key === 'length' || key === 'width') continue;
    rows.push({ label: k, value: String(v) });
  }

  return rows;
}

export default function ProviderJobDetail() {
  const { id } = useParams<{ id: string }>();
  const jobId = id ?? '';
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isProfileComplete } = useProviderStatus();
  const navigate = useNavigate();
  const { toast } = useToast();

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
  });
  const { data: materialRequestsData } = useQuery({
    queryKey: queryKeys.materialRequests.job(jobId),
    queryFn: () => getMaterialRequestsForJob(jobId),
    enabled: Boolean(jobId),
  });
  const materialRequests = materialRequestsData ?? [];
  const [noteTitle, setNoteTitle] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [commTab, setCommTab] = useState<'messages' | 'notes'>('messages');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDetails, setCancelDetails] = useState('');
  const [materialsBuilder, setMaterialsBuilder] = useState<MaterialLine[]>([]);
  const [servicePriceAmount, setServicePriceAmount] = useState('');
  const [servicePriceNote, setServicePriceNote] = useState('');
  const [addMaterialsOpen, setAddMaterialsOpen] = useState(false);
  const [editRequirementsOpen, setEditRequirementsOpen] = useState(false);
  const [editMeasurements, setEditMeasurements] = useState<Partial<Measurements>>({});
  const [editRequirementNotes, setEditRequirementNotes] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editLength, setEditLength] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  const [legacyInvoice, setLegacyInvoice] = useState<{ paidAt: string; cardLast4?: string } | null>(null);
  const [lockedTimelineStep, setLockedTimelineStep] = useState<number | null>(null);
  const [hoveredTimelineStep, setHoveredTimelineStep] = useState<number | null>(null);
  const [proposeReviseOpen, setProposeReviseOpen] = useState(false);
  const [reviseAmount, setReviseAmount] = useState('');
  const [reviseReason, setReviseReason] = useState('');

  useEffect(() => {
    if (paymentDetailsOpen && job?.laborPaid && !job.servicePayment) {
      getLaborInvoiceByJobId(job.id).then(inv => {
        if (inv) setLegacyInvoice({ paidAt: inv.paidAt, cardLast4: inv.cardLast4 });
      });
    } else {
      setLegacyInvoice(null);
    }
  }, [paymentDetailsOpen, job?.id, job?.laborPaid, job?.servicePayment]);

  useEffect(() => {
    if (!isError || !jobError) return;
    toast({
      title: 'Error',
      description: jobError instanceof Error ? jobError.message : 'Failed to load job details.',
      variant: 'destructive',
    });
  }, [isError, jobError, toast]);

  /** Reset local draft when navigating; hydrate from latest draft MR for this job */
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    setMaterialsBuilder([]);
    void getMaterialRequestsForJob(jobId)
      .then((rows) => {
        if (!alive) return;
        const draft = rows.find((r) => r.status === 'draft');
        if (draft?.items?.length) {
          setMaterialsBuilder(draft.items as MaterialLine[]);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [jobId]);

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

  const handleMarkInspectionDone = async () => {
    if (!job) return;
    try {
      await markInspectionDone(job.id);
      await syncJobsAfterMutation();
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
      await submitServicePrice(job.id, amount, servicePriceNote);
      await syncJobsAfterMutation();
      setServicePriceAmount('');
      setServicePriceNote('');
      toast({ title: 'Service price submitted', description: 'The user will be notified to pay.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to submit price.', variant: 'destructive' });
    }
  };

  const handleSubmitMaterials = async () => {
    if (!job) return;
    if (!isProfileComplete) {
      toast({
        title: 'Complete your profile',
        description: 'Finish onboarding before submitting materials to customers.',
        variant: 'destructive',
      });
      navigate('/provider/profile');
      return;
    }
    const draftMr = materialRequests.find((r) => r.status === 'draft');
    if (materialsBuilder.length === 0 && !draftMr) {
      toast({ title: 'No draft materials', description: 'Save materials first before submitting to user.' });
      return;
    }
    try {
      if (draftMr?.id) {
        await submitMaterialRequestPayload({ jobId: job.id, materialRequestId: draftMr.id });
      } else if (materialsBuilder.length > 0) {
        await submitMaterialRequestPayload({ jobId: job.id, materials: materialsBuilder });
      } else {
        return;
      }
      await syncJobsAfterMutation();
      const rows = await getMaterialRequestsForJob(job.id);
      const draft = rows.find((r) => r.status === 'draft');
      setMaterialsBuilder(draft?.items?.length ? (draft.items as MaterialLine[]) : []);
      setAddMaterialsOpen(false);
      toast({ title: 'Materials submitted', description: 'The user can now review and pay.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to submit materials.', variant: 'destructive' });
    }
  };

  const handleAcceptUserSuggestion = async (suggestionId: string) => {
    if (!job) return;
    try {
      await acceptUserSuggestion(job.id, suggestionId);
      await syncJobsAfterMutation();
      toast({ title: 'Suggestion accepted' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to accept.', variant: 'destructive' });
    }
  };

  const handleRejectUserSuggestion = async (suggestionId: string) => {
    if (!job) return;
    try {
      await rejectUserSuggestion(job.id, suggestionId);
      await syncJobsAfterMutation();
      toast({ title: 'Suggestion rejected' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to reject.', variant: 'destructive' });
    }
  };

  const handleSendChat = async () => {
    if (!job || !chatMessage.trim()) return;
    try {
      await addChatMessage(job.id, chatMessage);
      await syncJobsAfterMutation();
      setChatMessage('');
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to send message.', variant: 'destructive' });
    }
  };

  const handleSendNote = async () => {
    if (!job || !noteMessage.trim()) return;
    try {
      await addJobNote(job.id, noteMessage, noteTitle.trim() || undefined);
      await syncJobsAfterMutation();
      setNoteTitle('');
      setNoteMessage('');
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to send note.', variant: 'destructive' });
    }
  };

  const handleMarkComplete = async () => {
    if (!job) return;
    try {
      await updateJobStatus(job.id, 'AWAITING_CONFIRMATION');
      await syncJobsAfterMutation();
      toast({ title: 'Marked as complete', description: 'Waiting for user confirmation.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    if (!job || !cancelReason) return;
    try {
      const result = await cancelJob(job.id, cancelReason, cancelDetails);
      await syncJobsAfterMutation();
      setCancelOpen(false);
      toast({ title: 'Job cancelled', description: `Refund of ${formatCurrency(result.refundAmount)} will be processed.` });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to cancel job.', variant: 'destructive' });
    }
  };

  const handleProposeRevise = async () => {
    if (!job) return;
    const amount = parseFloat(reviseAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!reviseReason.trim()) {
      toast({ title: 'Add a short reason for the customer', variant: 'destructive' });
      return;
    }
    try {
      await proposeNewLaborPrice(job.id, amount, reviseReason.trim());
      await syncJobsAfterMutation();
      setProposeReviseOpen(false);
      setReviseAmount('');
      setReviseReason('');
      toast({ title: 'Revised quote sent', description: 'The customer must accept it before paying.' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to send proposal.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveRequirements = async () => {
    if (!job) return;
    const parseOptional = (raw: string): number | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const area = parseOptional(editArea);
    const length = parseOptional(editLength);
    const width = parseOptional(editWidth);
    const hasCoreMeasurement = area !== undefined || length !== undefined || width !== undefined;
    if (!hasCoreMeasurement) {
      toast({
        title: 'Missing measurements',
        description: 'Enter at least one of Area, Length, or Width before saving.',
        variant: 'destructive',
      });
      return;
    }

    const values: Record<string, number> = {
      ...(area !== undefined ? { area } : {}),
      ...(length !== undefined ? { length } : {}),
      ...(width !== undefined ? { width } : {}),
    };

    try {
      await updateProviderRequirements(job.id, {
        measurements: {
          ...editMeasurements,
          values,
        },
        requirementNotes: editRequirementNotes || undefined,
      });
      await syncJobsAfterMutation();
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
  const canProceedWithSpecs = Boolean(
    effectiveMeasurements &&
      ((effectiveMeasurements.values && Object.keys(effectiveMeasurements.values).length > 0) ||
        (effectiveMeasurements.movingItems && effectiveMeasurements.movingItems.length > 0) ||
        (effectiveMeasurements.plumbingIssue &&
          (Boolean(effectiveMeasurements.plumbingIssue.type) ||
            Boolean(effectiveMeasurements.plumbingIssue.description))) ||
        effectiveMeasurements.cameraAssist)
  );
  const requirementNotes = job?.providerAdjustedRequirements?.requirementNotes;
  const measurementRows = formatMeasurementRows(effectiveMeasurements?.values);
  const isCancelledJob = job?.status === 'CANCELLED';
  const cancellationReasonText =
    (job?.cancellationDetails && job.cancellationDetails.trim()) ||
    (job?.cancellationReason && job.cancellationReason.trim()) ||
    'No reason provided';
  const locationParts = job?.location
    ? [job.location.address, job.location.city, job.location.area, job.location.suburb].filter(Boolean)
    : [];
  const fullAddress = locationParts.join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const rawStoreOrders = job?.storeOrders && job.storeOrders.length > 0 ? job.storeOrders : [];
  const seenMaterialOrderIds = new Set<string>();
  const materialCards = rawStoreOrders.filter((o) => {
    if (seenMaterialOrderIds.has(o.orderId)) return false;
    seenMaterialOrderIds.add(o.orderId);
    return true;
  });
  const materialsStackSorted = [...materialCards].sort((a, b) => {
    const ap = a.payment?.materialsPaid ? 1 : 0;
    const bp = b.payment?.materialsPaid ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  const hasAnyMaterialPaid = materialCards.some((card) => card.payment?.materialsPaid);
  const allMaterialsPaid = materialCards.length > 0 && materialCards.every((card) => card.payment?.materialsPaid);
  const pendingMaterialCards = materialCards.filter((card) => !card.payment?.materialsPaid);
  const paidMaterialBatches = materialsStackSorted.filter((card) => card.payment?.materialsPaid);
  const profileBlocksWorkflow = !isProfileComplete;
  const canEditMaterials = !profileBlocksWorkflow;
  const getPendingOrderForAcceptedSuggestion = (suggestion: NonNullable<Job['userMaterialSuggestions']>[number]) => {
    const linked = pendingMaterialCards.find(card => card.sourceUserSuggestionId === suggestion.id);
    if (linked) return linked;
    return [...pendingMaterialCards].reverse().find(
      card =>
        card.storeId === suggestion.suggested.supplierId &&
        card.items.some(item => item.productId === suggestion.suggested.productId)
    );
  };
  const customerSuggestionsForDisplay = (job?.userMaterialSuggestions || []).filter(suggestion => {
    if (suggestion.status === 'pending') return true;
    if (suggestion.status === 'accepted') return !!getPendingOrderForAcceptedSuggestion(suggestion);
    return false;
  });
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
  const draftMrFromApi = materialRequests.find((r) => r.status === 'draft');
  const hasSubmittedMaterialRequests = materialRequests.some((r) => r.status === 'submitted');

  const showMarkComplete = job ? ACTIVE_WORKFLOW_JOB_STATUSES.includes(job.status) : false;
  const showCancel = job
    ? ACTIVE_WORKFLOW_JOB_STATUSES.includes(job.status) || job.status === 'AWAITING_CONFIRMATION'
    : false;

  const getStatusBadge = (current: Job) => (
    <Badge variant={getProviderJobBadgeVariantForJob(current)}>{getJobDisplayStatusLabel(current)}</Badge>
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

  const providerTimelineView = getProviderJobTimelineViewState(job, materialRequests);

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
          <div className="shrink-0">{getStatusBadge(job)}</div>
        </div>

        {/* Status Timeline (provider workflow: materials + job state) */}
        <JobWorkflowTimeline
          job={job}
          view={providerTimelineView}
          variant="provider"
          getStepInsight={(stepIndex) => getProviderTimelineStepInsight(job, materialRequests, stepIndex)}
          cancellationReasonText={cancellationReasonText}
          lockedTimelineStep={lockedTimelineStep}
          setLockedTimelineStep={setLockedTimelineStep}
          hoveredTimelineStep={hoveredTimelineStep}
          setHoveredTimelineStep={setHoveredTimelineStep}
        />

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
              <p className="text-muted-foreground text-sm">Measurements & Requirements</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setEditRequirementsOpen(true);
                  setEditMeasurements(job.providerAdjustedRequirements?.measurements || {});
                  const openValues = job.providerAdjustedRequirements?.measurements?.values || job.measurements?.values || {};
                  setEditArea(openValues.area != null ? String(openValues.area) : '');
                  setEditLength(openValues.length != null ? String(openValues.length) : '');
                  setEditWidth(openValues.width != null ? String(openValues.width) : '');
                  setEditRequirementNotes(job.providerAdjustedRequirements?.requirementNotes || '');
                }}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            </div>
            {effectiveMeasurements && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2 border border-primary/40">
                {effectiveMeasurements.cameraAssist && (
                  <div className="mb-3 space-y-2">
                    <p className="text-muted-foreground text-xs">Guided measurement</p>
                    <MeasurementCard measurement={effectiveMeasurements.cameraAssist} />
                  </div>
                )}
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
                    <div>
                      <span className="text-muted-foreground">Details:</span>{' '}
                      {effectiveMeasurements.plumbingIssue.description?.trim() || job.description || '—'}
                    </div>
                  </>
                ) : measurementRows.length > 0 ? (
                  measurementRows.map((row) => (
                    <div key={row.label} className="flex justify-between">
                      <span className="capitalize text-muted-foreground">{row.label}</span>
                      <span>{row.value}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No measurement values provided.</p>
                )}
                {requirementNotes && (
                  <div className="pt-2 border-t border-border mt-2">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
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
                    <img src={resolveUploadUrl(img)} alt="" className="h-full w-full object-cover" />
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
              {!canProceedWithSpecs && (
                <p className="text-warning text-sm">
                  You must add measurements before completing this step.
                </p>
              )}
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
                <Button
                  onClick={handleSubmitServicePrice}
                  disabled={!canProceedWithSpecs || !servicePriceAmount || parseFloat(servicePriceAmount) <= 0}
                >
                  Submit Price
                </Button>
              </div>
            </div>
          )}

          {job.proposedLaborPrice && !job.laborPaid && (
            <div className="p-4 border border-amber-500/40 rounded-lg bg-amber-500/5 space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Revised quote pending customer approval
              </p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(job.proposedLaborPrice.amount, { decimals: 2 })}
              </p>
              {job.proposedLaborPrice.reason ? (
                <p className="text-xs text-muted-foreground">{job.proposedLaborPrice.reason}</p>
              ) : null}
            </div>
          )}

          {job.servicePrice && !job.laborPaid && !job.proposedLaborPrice && (
            <div className="p-4 border border-primary/40 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">
                If the scope changed before the customer pays, you can send a revised quote.
              </p>
              <Button variant="outline" size="sm" onClick={() => setProposeReviseOpen(true)}>
                Propose revised price
              </Button>
            </div>
          )}

          {/* Mark inspection (skipped when category does not require inspection) */}
          {job.status === 'ASSIGNED' && job.requiresInspection !== false && (
            <div className="p-4 border border-primary/40 rounded-lg space-y-4">
              <h3 className="font-medium">Service Inspection</h3>
              <p className="text-sm text-muted-foreground">Mark inspection done, then submit your service price.</p>
              {!canProceedWithSpecs && (
                <p className="text-warning text-sm">
                  You must add measurements before completing this step.
                </p>
              )}
              <Button onClick={handleMarkInspectionDone} disabled={!canProceedWithSpecs}>
                Mark Inspection Done
              </Button>
            </div>
          )}
          
        </div>

        <MaterialsSection
          job={job}
          materialRequests={materialRequests}
          paidBatches={paidMaterialBatches}
          pendingOrders={pendingMaterialCards}
          draftCardsByStore={draftCardsByStore}
          hasDraftMaterials={hasDraftMaterials}
          hasSubmittedMaterialRequests={hasSubmittedMaterialRequests}
          customerSuggestionsForDisplay={customerSuggestionsForDisplay}
          getPendingOrderForAcceptedSuggestion={getPendingOrderForAcceptedSuggestion}
          allMaterialsPaid={allMaterialsPaid}
          hasAnyMaterialPaid={hasAnyMaterialPaid}
          canEditMaterials={canEditMaterials}
          profileBlocksWorkflow={profileBlocksWorkflow}
          materialsBuilder={materialsBuilder}
          draftMrFromApi={draftMrFromApi}
          onNavigateProfile={() => navigate('/provider/profile')}
          onAddMaterials={() => setAddMaterialsOpen(true)}
          onSubmitMaterials={handleSubmitMaterials}
          onAcceptSuggestion={handleAcceptUserSuggestion}
          onRejectSuggestion={handleRejectUserSuggestion}
        />

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
          jobLocation={job.location ?? undefined}
          jobCategory={job.category}
          existingMaterials={materialsBuilder}
          onAddMaterials={(mats) => {
            setMaterialsBuilder(mats);
            if (!job?.id) return;
            void createMaterialRequestDraft({ jobId: job.id, items: mats })
              .then(() =>
                queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.job(jobId) })
              )
              .catch((err: unknown) =>
                toast({
                  title: 'Could not save draft',
                  description: err instanceof Error ? err.message : 'Try again.',
                  variant: 'destructive',
                })
              );
          }}
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
                <label className="text-sm font-medium">Area (m²)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 20"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Length (m)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 5"
                  value={editLength}
                  onChange={(e) => setEditLength(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Width (m)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 4"
                  value={editWidth}
                  onChange={(e) => setEditWidth(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Additional Notes (optional)</label>
                <Textarea
                  placeholder="Add notes about dimensions, quantities, or work requirements..."
                  value={editRequirementNotes}
                  onChange={e => setEditRequirementNotes(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter at least one of Area, Length, or Width.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRequirementsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRequirements}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={proposeReviseOpen} onOpenChange={setProposeReviseOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Propose revised labor price</DialogTitle>
              <DialogDescription>
                The customer must accept this before paying. Briefly explain the change.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">New amount (R)</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={reviseAmount}
                  onChange={(e) => setReviseAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Reason</label>
                <Textarea
                  value={reviseReason}
                  onChange={(e) => setReviseReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Additional prep work required on site"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProposeReviseOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleProposeRevise()}>Send to customer</Button>
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
