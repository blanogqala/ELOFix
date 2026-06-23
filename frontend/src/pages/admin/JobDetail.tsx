import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getJobById, releaseEscrowPayment } from '@/lib/api/jobs';
import { getAdminJobCompletionEvidence, getAdminDisputeDetail, adminCompletionEvidenceExportUrl } from '@/lib/api/adminDisputes';
import type { AdminDisputeRow } from '@/lib/api/adminDisputes';
import { formatRequestedResolution } from '@/lib/disputeLabels';
import { JobDisputeStatusBanner } from '@/components/jobs/JobDisputeStatusBanner';
import { JobWorkflowTimeline } from '@/components/jobs/JobWorkflowTimeline';
import { getTimelineStepInsight } from '@/lib/jobTimelineInsights';
import type { JobCompletionEvidence } from '@/types';
import { getMaterialRequestsForJob } from '@/lib/api/materialRequests';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { getProviderById } from '@/lib/api/providers';
import { getCategories } from '@/lib/api/categories';
import { getUserById } from '@/lib/api/users';
import { Category, Job, User, Provider, MaterialLine, JobStoreOrder } from '@/types';
import {
  ArrowLeft,
  Briefcase,
  User as UserIcon,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Package,
  Store,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { AdminJobPaymentBreakdownCard } from '@/components/admin/AdminJobPaymentBreakdownCard';
import { AdminMaterialStoreBreakdown } from '@/components/admin/AdminMaterialStoreBreakdown';
import { AdminJobQuoteBreakdown } from '@/components/admin/AdminJobQuoteBreakdown';
import { canAdminManualReleaseEscrow, getAdminJobQuoteBreakdown } from '@/lib/adminJobFinancial';
import { getStoreOrderDeliveryLine } from '@/lib/jobQuoteDisplay';
import { resolveMaterialOrderForStoreOrder } from '@/lib/providerMaterialOrderHelpers';
import { MeasurementCard } from '@/components/measurements/MeasurementCard';
import { getJobDisplayStatusLabel, getUserJobBadgeClassForJob } from '@/lib/jobProgressDisplay';
import { getUserTimelineViewState } from '@/lib/userJobTimeline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function AdminJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<User | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseAmount, setReleaseAmount] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);
  const [materialsModalOpen, setMaterialsModalOpen] = useState(false);
  const [commTab, setCommTab] = useState<'messages' | 'notes'>('messages');
  const [materialRequests, setMaterialRequests] = useState<MaterialRequestDto[]>([]);
  const [completionEvidence, setCompletionEvidence] = useState<JobCompletionEvidence | null>(null);
  const [openDispute, setOpenDispute] = useState<AdminDisputeRow | null>(null);
  const [lockedTimelineStep, setLockedTimelineStep] = useState<number | null>(null);
  const [hoveredTimelineStep, setHoveredTimelineStep] = useState<number | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getCategories());
    } catch {
      setCategories([]);
    }
  }, []);

  const loadJob = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getJobById(id);
      setJob(data || null);
      if (data?.id) {
        try {
          setMaterialRequests(await getMaterialRequestsForJob(data.id));
        } catch {
          setMaterialRequests([]);
        }
      } else {
        setMaterialRequests([]);
      }
      if (data?.userId) {
        const userData = await getUserById(data.userId);
        setCustomer(userData || null);
      } else {
        setCustomer(null);
      }
      if (data?.providerId) {
        const providerData = await getProviderById(data.providerId);
        setProvider(providerData || null);
      } else {
        setProvider(null);
      }
      try {
        setCompletionEvidence(await getAdminJobCompletionEvidence(id));
      } catch {
        setCompletionEvidence(null);
      }
      if (data?.disputeId) {
        try {
          const disputeData = await getAdminDisputeDetail(data.disputeId);
          setOpenDispute(disputeData.dispute);
        } catch {
          setOpenDispute(null);
        }
      } else {
        setOpenDispute(null);
      }
    } catch (error) {
      console.error('Failed to load job:', error);
      toast({ title: 'Error', description: 'Failed to load job.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (id) {
      void loadJob();
    }
    void loadCategories();
  }, [id, loadCategories, loadJob]);

  const getPaymentStatus = () => {
    if (!job) return { label: 'Unknown', class: 'text-muted-foreground' };
    const held = job.escrow.heldAmount || 0;
    const released = job.escrow.releasedAmount || 0;
    if (held > 0 && released === 0) return { label: 'Payment Held', class: 'text-warning' };
    if (held > 0 && released > 0) return { label: 'Partially Paid', class: 'text-primary' };
    return { label: 'Fully Paid', class: 'text-success' };
  };

  const getMaxReleasable = () => {
    if (!job) return 0;
    return job.escrow.heldAmount || 0;
  };

  const handleReleasePayment = async () => {
    if (!job) return;
    const amount = parseFloat(releaseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setIsReleasing(true);
    try {
      const updated = await releaseEscrowPayment(job.id, amount);
      setJob(updated);
      setReleaseModalOpen(false);
      setReleaseAmount('');
      toast({ title: 'Payment released', description: `${formatCurrency(amount)} released to provider.` });
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to release payment.',
        variant: 'destructive',
      });
    } finally {
      setIsReleasing(false);
    }
  };

  const getStatusBadge = (current: Job) => (
    <span className={cn('status-badge', getUserJobBadgeClassForJob(current))}>
      {getJobDisplayStatusLabel(current)}
    </span>
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Button variant="ghost" onClick={() => navigate('/admin/jobs')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Button>
          <div className="card-elevated p-12 text-center">
            <p className="text-muted-foreground">Job not found</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const paymentStatus = getPaymentStatus();
  const heldAmount = job.escrow.heldAmount || 0;
  const releasedAmount = job.escrow.releasedAmount || 0;
  const maxReleasable = getMaxReleasable();
  const canReleaseEscrow = canAdminManualReleaseEscrow(job);

  const materials = job.materials || [];
  const materialsByStore = materials.reduce(
    (acc, m) => {
      if (!acc[m.supplierId]) {
        acc[m.supplierId] = {
          id: m.supplierId,
          name: m.supplierName,
          materials: [],
          total: 0,
        };
      }
      acc[m.supplierId].materials.push(m);
      acc[m.supplierId].total += m.qty * m.unitPrice;
      return acc;
    },
    {} as Record<string, { id: string; name: string; materials: MaterialLine[]; total: number }>
  );
  const hasMaterials = Object.keys(materialsByStore).length > 0;
  const quoteBreakdown = getAdminJobQuoteBreakdown(job);
  const showQuoteSummary = quoteBreakdown.labor > 0 || quoteBreakdown.material > 0;
  const timelineView = getUserTimelineViewState(job, materialRequests);
  const cancellationReasonText =
    (job.cancellationDetails && job.cancellationDetails.trim()) ||
    (job.cancellationReason && job.cancellationReason.trim()) ||
    'No reason provided';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() =>
              navigate(job.status === 'DISPUTED' ? '/admin/jobs?view=dispatched' : '/admin/jobs')
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Job progress</h2>
            <p className="text-sm text-muted-foreground">Shared milestones (customer, provider, admin).</p>
          </div>
          <JobWorkflowTimeline
            job={job}
            view={timelineView}
            variant="user"
            getStepInsight={(stepIndex) => getTimelineStepInsight(job, stepIndex, materialRequests)}
            cancellationReasonText={cancellationReasonText}
            lockedTimelineStep={lockedTimelineStep}
            setLockedTimelineStep={setLockedTimelineStep}
            hoveredTimelineStep={hoveredTimelineStep}
            setHoveredTimelineStep={setHoveredTimelineStep}
          />
        </div>

        {(job.status === 'DISPUTED' || job.disputeId) && (
          <JobDisputeStatusBanner
            variant="admin"
            customerRequested={
              openDispute
                ? formatRequestedResolution(
                    openDispute.requestedResolution,
                    openDispute.otherResolutionDetail,
                  )
                : undefined
            }
            customerComment={openDispute?.customerComment}
            disputeId={job.disputeId}
            onOpenDisputeCase={
              job.disputeId
                ? () => navigate(`/admin/disputes/${job.disputeId}`)
                : undefined
            }
          />
        )}

        {completionEvidence && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Completion Evidence</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={adminCompletionEvidenceExportUrl(job.id)} target="_blank" rel="noreferrer">
                    Export ZIP
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Rating</p>
                  <p className="font-medium">{completionEvidence.rating ?? '—'} / 5</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Confirmed</p>
                  <p>{new Date(completionEvidence.confirmedAt).toLocaleString()}</p>
                </div>
                {completionEvidence.paymentReleasedAt && (
                  <div>
                    <p className="text-muted-foreground">Payment released</p>
                    <p>{new Date(completionEvidence.paymentReleasedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
              {completionEvidence.review && (
                <p className="text-sm border rounded-lg p-3 bg-muted/30">{completionEvidence.review}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {completionEvidence.images.map((url) => (
                  <a key={url} href={resolveUploadUrl(url)} target="_blank" rel="noreferrer">
                    <img src={resolveUploadUrl(url)} alt="" className="h-20 w-20 rounded object-cover" />
                  </a>
                ))}
                {completionEvidence.videos.map((url) => (
                  <video key={url} src={resolveUploadUrl(url)} className="h-20 w-32 rounded" controls />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Job Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 ml-6 mr-6 mb-10 pt-2 bg-muted/30 rounded-lg border border-primary/90">
              <div  className="border-b border-primary/20 pb-3">
                <p className="text-sm text-muted-foreground">Title / Category</p>
                <p className="font-medium">{job.categoryName}</p>
              </div>
              <div className="border-b border-primary/20 pb-3">
                <p className="text-sm text-muted-foreground">Description</p>
                <p>{job.description}</p>
              </div>
              {job.images.length > 0 && (
                <div className="border-b border-primary/20 pb-3">
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
              {job.measurements?.cameraAssist && (
                <div className="border-b border-primary/20 pb-3">
                  <p className="text-sm text-muted-foreground mb-2">Guided measurement</p>
                  <MeasurementCard measurement={job.measurements.cameraAssist} />
                </div>
              )}
              <div className="border-b border-primary/20 pb-3">
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(job)}
              </div>
              {job.location && (
                <div className="border-b border-primary/20 pb-3">
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p>{[job.location.city, job.location.area, job.location.address].filter(Boolean).join(', ')}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm border-b border-primary/20 pb-3">
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(job.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p>{new Date(job.updatedAt).toLocaleString()}</p>
                </div>
              </div>
              {showQuoteSummary ? (
                <div className="border-b border-primary/20 pb-3">
                  <p className="text-sm text-muted-foreground mb-2">Quote (labor + material)</p>
                  <AdminJobQuoteBreakdown job={job} className="text-sm" />
                </div>
              ) : null}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Material Stores</p>
                {hasMaterials ? (
                  <div className="space-y-1">
                    <ul className="list-none text-sm space-y-2">
                      {Object.values(materialsByStore).map(store => (
                        <li key={store.id} className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                          <span className="text-sm font-medium">{store.name}</span>
                          <AdminMaterialStoreBreakdown
                            job={job}
                            supplierId={store.id}
                            lineItemsTotal={store.total}
                          />
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="link"
                      className="h-auto p-0 mt-2 text-accent"
                      onClick={e => {
                        e.stopPropagation();
                        setMaterialsModalOpen(true);
                      }}
                    >
                      View Material Details <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No materials submitted yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Customer & Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-primary/90">
                <p className="text-sm font-medium text-muted-foreground">Customer</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{customer?.name || job.userName || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{customer?.email || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{customer?.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {job.location
                        ? [job.location.address, job.location.city, job.location.area].filter(Boolean).join(', ') || '—'
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  'space-y-3 p-4 rounded-lg border border-primary/90 pb-20',
                  job.providerId ? 'bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors' : 'bg-muted/30'
                )}
                onClick={() => job.providerId && navigate(`/admin/providers/${job.providerId}`)}
              >
                <p className="text-sm font-medium text-muted-foreground">Provider</p>
                {job.providerId ? (
                  <>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{provider?.name || job.providerName || '—'}</span>
                        {job.providerId && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{provider?.email || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{provider?.phone || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize">
                          {provider?.city || provider?.serviceAreas?.join(', ') || '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {provider?.skills?.length
                            ? provider.skills
                                .map(s => categories.find(c => c.id === s)?.name || s)
                                .filter(Boolean)
                                .join(', ') || '—'
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={cn('font-medium', provider?.approved ? 'text-success' : 'text-warning')}>
                          {provider?.approved ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-accent mt-2 cursor-pointer hover:text-accent hover:underline transition-colors">Click to view provider profile<ArrowRight className="h-4 w-4" /> </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">No provider assigned</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <AdminJobPaymentBreakdownCard
          job={job}
          footer={
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Escrow / workflow status</span>
                <span className={cn('font-medium', paymentStatus.class)}>{paymentStatus.label}</span>
              </div>
              {maxReleasable > 0 && canReleaseEscrow ? (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setReleaseAmount(String(maxReleasable));
                    setReleaseModalOpen(true);
                  }}
                >
                  Release payment
                </Button>
              ) : maxReleasable > 0 && !canReleaseEscrow ? (
                <p className="text-sm text-muted-foreground">
                  Courier delivery funds are held until the customer confirms delivery.
                </p>
              ) : heldAmount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Up to {formatCurrency(heldAmount)} still held in escrow for release when the job is ready.
                </p>
              ) : null}
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Communication
            </CardTitle>
            <p className="text-sm text-muted-foreground">Admin can view but not send messages.</p>
          </CardHeader>
          <CardContent>
            <div className="flex border-b border-border ">
              <button
                onClick={() => setCommTab('messages')}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  commTab === 'messages'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Messages
              </button>
              <button
                onClick={() => setCommTab('notes')}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  commTab === 'notes'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Job Notes
              </button>
            </div>
            {commTab === 'messages' && (
              <div className="mt-4">
                {job.chat && job.chat.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {job.chat.map(msg => (
                      <div key={msg.id} className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm font-medium">{msg.authorName}</p>
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No messages yet</p>
                )}
              </div>
            )}
            {commTab === 'notes' && (
              <div className="mt-4">
                {job.jobNotes && job.jobNotes.length > 0 ? (
                  <div className="space-y-3">
                    {job.jobNotes.map(note => (
                      <div key={note.id} className="p-3 border rounded-lg">
                        <p className="text-sm font-medium">{note.authorName}</p>
                        {note.title && <p className="text-xs text-muted-foreground">{note.title}</p>}
                        <p className="text-sm">{note.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(note.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No notes yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={releaseModalOpen} onOpenChange={setReleaseModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Release Payment</DialogTitle>
              <DialogDescription>
                Release funds from escrow to the provider (partial or full). Max releasable:{' '}
                {formatCurrency(maxReleasable)} (current held balance).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="release-amount">Amount (R)</Label>
                <Input
                  id="release-amount"
                  type="number"
                  min={0}
                  max={maxReleasable}
                  step={1}
                  value={releaseAmount}
                  onChange={e => setReleaseAmount(e.target.value)}
                  placeholder={String(maxReleasable)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReleaseModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleReleasePayment}
                disabled={isReleasing || !releaseAmount || parseFloat(releaseAmount) <= 0 || parseFloat(releaseAmount) > maxReleasable}
              >
                {isReleasing ? 'Releasing...' : 'Release Payment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={materialsModalOpen} onOpenChange={setMaterialsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Material Order Details
              </DialogTitle>
              <DialogDescription>Full material order information for this job</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {hasMaterials &&
                Object.entries(materialsByStore).map(([storeId, store]) => {
                  const storeOrder = job.storeOrders?.find((so: JobStoreOrder) => so.storeId === storeId);
                  const mo = storeOrder ? resolveMaterialOrderForStoreOrder(job, storeOrder) : null;
                  const deliveryLine = storeOrder ? getStoreOrderDeliveryLine(storeOrder, mo) : null;
                  const deliveryFee =
                    deliveryLine?.includeInSubtotal && !deliveryLine.struck ? deliveryLine.amount : 0;
                  const grandTotal = store.total + deliveryFee;
                  return (
                    <div key={storeId} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Store className="h-4 w-4" />
                        {store.name}
                      </div>
                      <div className="space-y-2 text-sm">
                        {store.materials.map(m => (
                          <div key={m.productId} className="flex justify-between items-center py-1 border-b border-border last:border-0">
                            <div>
                              <span className="font-medium">{m.name}</span>
                              <span className="text-muted-foreground ml-2">× {m.qty} {m.unit}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-muted-foreground">{formatCurrency(m.unitPrice)}/unit</span>
                              <span className="ml-2 font-medium">{formatCurrency(m.qty * m.unitPrice)}</span>
                            </div>
                          </div>
                        ))}
                        {deliveryFee > 0 && (
                          <div className="flex justify-between py-1 border-t border-border">
                            <span className="text-muted-foreground">Delivery Fee</span>
                            <span>{formatCurrency(deliveryFee)}</span>
                          </div>
                        )}
                        <div className="space-y-2 pt-2 border-t border-border text-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Materials settlement
                          </p>
                          <AdminMaterialStoreBreakdown
                            job={job}
                            supplierId={storeId}
                            lineItemsTotal={store.total}
                          />
                        </div>
                        <div className="flex justify-between font-semibold pt-2 text-base">
                          <span>Customer total{deliveryFee > 0 ? ' (materials + delivery)' : ''}</span>
                          <span>{formatCurrency(grandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
