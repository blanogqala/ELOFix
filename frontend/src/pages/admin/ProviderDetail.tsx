import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  getProviderById,
  approveProvider,
  rejectProvider,
  unrejectProvider,
  blockProvider,
  unblockProvider,
  deleteProvider,
  approveProviderDocument,
  rejectProviderDocument,
} from '@/lib/api/providers';
import { getCategories } from '@/lib/api/categories';
import { getAdminProviderAnalytics, type AdminProviderAnalytics } from '@/lib/api/admin';
import { getProviderReviews } from '@/lib/api/providerReviews';
import { ProviderReviewList } from '@/components/providers/ProviderReviewList';
import { Category, Provider, ProviderReview } from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Star,
  FileCheck,
  Calendar,
  Check,
  X,
  Ban,
  Trash2,
  ExternalLink,
  Images,
  Plus,
  MessageSquare,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_PROVIDER_DOCUMENTS,
  REQUIRED_PROVIDER_DOCUMENTS,
  ADMIN_OPTIONAL_PROVIDER_DOCUMENTS,
  adminCanApproveProviderAccount,
  type ProviderDocType,
} from '@/lib/providerDocuments';
import {
  canAdminActOnProviderApplication,
  canAdminUnrejectProvider,
  getProviderAccountStatus,
  getProviderAccountStatusBadgeClass,
  getProviderAccountStatusLabel,
  isProviderApplicationRejected,
} from '@/lib/providerAccountStatus';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

type AdminDocType = ProviderDocType;

function docStatusLabel(status: string | undefined, hasUrl: boolean) {
  if (!hasUrl) return 'Not uploaded';
  return status === 'approved' || status === 'rejected' || status === 'pending' ? status : 'pending';
}

function AdminDocumentRow({
  label,
  doc,
  hasUrl,
  providerBlocked,
  isMutating,
  onApprove,
  onReject,
}: {
  label: string;
  doc?: Provider['documents'][ProviderDocType];
  hasUrl: boolean;
  providerBlocked?: boolean;
  isMutating: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-primary p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex max-w-full flex-wrap items-center gap-2 overflow-hidden">
          <p className="font-medium text-sm">{label}</p>
          <DocStatusBadge status={doc?.status} hasUrl={hasUrl} />
        </div>
        {doc?.feedback ? (
          <p className="text-xs text-muted-foreground">Feedback: {doc.feedback}</p>
        ) : null}
        {!hasUrl ? (
          <span className="text-xs text-muted-foreground">No file uploaded</span>
        ) : null}
      </div>
      {hasUrl && !providerBlocked ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 overflow-hidden">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 px-3 text-xs font-medium"
            disabled={isMutating || doc?.status === 'approved'}
            onClick={onApprove}
          >
            <Check className="mr-1 h-3 w-3" />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-destructive/40 px-3 text-xs text-destructive"
            disabled={isMutating}
            onClick={onReject}
          >
            <X className="mr-1 h-3 w-3" />
            Reject
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" asChild>
            <a
              href={resolveUploadUrl(doc!.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DocStatusBadge({ status, hasUrl }: { status: string | undefined; hasUrl: boolean }) {
  const label = docStatusLabel(status, hasUrl);
  if (!hasUrl) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label}</span>;
  }
  if (label === 'approved') {
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">{label}</span>;
  }
  if (label === 'rejected') {
    return <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">{label}</span>;
  }
  return <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-950 dark:text-amber-100">{label}</span>;
}

export default function AdminProviderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { from, jobId } = (location.state as { from?: string; jobId?: string }) || {};
  const { toast } = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [analytics, setAnalytics] = useState<AdminProviderAnalytics | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [reviewsDialogOpen, setReviewsDialogOpen] = useState(false);
  const [customerReviews, setCustomerReviews] = useState<ProviderReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsSummary, setReviewsSummary] = useState({ averageRating: 0, totalReviews: 0 });
  const [docRejectTarget, setDocRejectTarget] = useState<AdminDocType | null>(null);
  const [docRejectFeedback, setDocRejectFeedback] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getCategories());
    } catch {
      setCategories([]);
    }
  }, []);

  const loadProvider = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getProviderById(id);
      setProvider(data || null);
    } catch (error) {
      console.error('Failed to load provider:', error);
      toast({ title: 'Error', description: 'Failed to load provider.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  const loadAnalytics = useCallback(async () => {
    if (!id) return;
    setIsAnalyticsLoading(true);
    try {
      const data = await getAdminProviderAnalytics(id);
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load provider analytics:', error);
      setAnalytics(null);
      toast({
        title: 'Analytics unavailable',
        description: error instanceof Error ? error.message : 'Could not load provider analytics.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyticsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (id) {
      void loadProvider();
      void loadAnalytics();
    }
    void loadCategories();
  }, [id, loadCategories, loadProvider, loadAnalytics]);

  const openCustomerReviewsDialog = useCallback(async () => {
    if (!provider?.id) return;
    setReviewsDialogOpen(true);
    setReviewsLoading(true);
    try {
      const res = await getProviderReviews(provider.id, { limit: 50 });
      setCustomerReviews(res.reviews);
      setReviewsSummary({
        averageRating: res.averageRating,
        totalReviews: res.totalReviews,
      });
    } catch (error) {
      console.error('Failed to load customer reviews:', error);
      setCustomerReviews([]);
      toast({
        title: 'Error',
        description: 'Failed to load customer reviews.',
        variant: 'destructive',
      });
    } finally {
      setReviewsLoading(false);
    }
  }, [provider?.id, toast]);

  const getCategoryNames = (skills: string[]) =>
    skills
      .map(s => categories.find(c => c.id === s)?.name)
      .filter(Boolean) as string[];

  const getAccountStatus = () => {
    if (!provider) return '';
    return getProviderAccountStatusLabel(getProviderAccountStatus(provider));
  };

  const canApproveAccount = (p: Provider) => adminCanApproveProviderAccount(p);

  const openImagePreview = (url: string) => {
    const abs = resolveUploadUrl(url);
    if (abs) setImagePreviewUrl(abs);
  };

  const handleApproveDocument = async (docType: AdminDocType) => {
    if (!provider || isMutating) return;
    try {
      setIsMutating(true);
      const updated = await approveProviderDocument(provider.id, docType);
      setProvider(updated);
      toast({
        title: 'Document approved',
        description: `${ALL_PROVIDER_DOCUMENTS.find((d) => d.id === docType)?.label ?? docType} marked approved.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve document.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleRejectDocumentSubmit = async () => {
    if (!provider || !docRejectTarget || isMutating) return;
    try {
      setIsMutating(true);
      const updated = await rejectProviderDocument(provider.id, docRejectTarget, docRejectFeedback);
      setProvider(updated);
      toast({
        title: 'Document rejected',
        description: 'The provider will see the updated status and any feedback.',
      });
      setDocRejectTarget(null);
      setDocRejectFeedback('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject document.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleApprove = async () => {
    if (!provider || isMutating) return;
    try {
      setIsMutating(true);
      await approveProvider(provider.id);
      toast({ title: 'Provider approved', description: 'The provider can now receive job requests.' });
      await loadProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleReject = async () => {
    if (!provider || !rejectReason.trim() || isMutating) {
      toast({ title: 'Reason required', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }
    try {
      setIsMutating(true);
      await rejectProvider(provider.id, rejectReason.trim());
      toast({ title: 'Provider rejected', description: 'The provider has been notified.' });
      setRejectModalOpen(false);
      setRejectReason('');
      await loadProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUnreject = async () => {
    if (!provider || isMutating) return;
    try {
      setIsMutating(true);
      await unrejectProvider(provider.id);
      toast({
        title: 'Provider unrejected',
        description: 'The provider has been returned to pending review.',
      });
      await loadProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unreject provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleBlock = async () => {
    if (!provider || isMutating) return;
    if (!blockReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for blocking this provider.', variant: 'destructive' });
      return;
    }
    try {
      setIsMutating(true);
      await blockProvider(provider.id, blockReason.trim());
      toast({
        title: 'Provider blocked',
        description: 'They can still sign in and view history, but cannot accept jobs or withdraw.',
      });
      setBlockModalOpen(false);
      setBlockReason('');
      await loadProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to block provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUnblock = async () => {
    if (!provider || isMutating) return;
    try {
      setIsMutating(true);
      await unblockProvider(provider.id);
      toast({ title: 'Provider unblocked', description: 'The provider can access the platform and withdraw again.' });
      await loadProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unblock provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!provider || isMutating) return;
    try {
      setIsMutating(true);
      await deleteProvider(provider.id);
      toast({ title: 'Provider deleted', description: 'Provider has been soft removed.' });
      setDeleteModalOpen(false);
      navigate('/admin/providers');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsMutating(false);
    }
  };

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

  if (!provider) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Button
            variant="ghost"
            onClick={() => {
              if (from === 'job-details' && jobId) {
                navigate(`/admin/jobs/${jobId}`);
              } else {
                navigate('/admin/providers');
              }
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {from === 'job-details' && jobId ? 'Back to Job Details' : 'Back to Providers'}
          </Button>
          <div className="card-elevated p-12 text-center">
            <p className="text-muted-foreground">Provider not found</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const serviceNames = getCategoryNames(provider.skills);
  const pendingServiceSuggestions = provider.pendingSuggestions || [];
  const statusClass = getProviderAccountStatusBadgeClass(getProviderAccountStatus(provider)).replace(
    'status-badge ',
    ''
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              if (from === 'job-details' && jobId) {
                navigate(`/admin/jobs/${jobId}`);
              } else {
                navigate('/admin/providers');
              }
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {from === 'job-details' && jobId ? 'Back to Job Details' : 'Back to Providers'}
          </Button>
        </div>

        <div className="card-elevated overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10">
                  {provider.profileImage?.trim() ? (
                    <img
                      src={resolveUploadUrl(provider.profileImage)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{provider.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{provider.name}</h1>
                  <p className="text-muted-foreground">{provider.email}</p>
                  <span className={cn('status-badge mt-2 inline-block', statusClass)}>
                    {getAccountStatus()}
                  </span>
                  {provider.reviewSubmittedAt && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Submitted for review:{' '}
                      {new Date(provider.reviewSubmittedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-2 overflow-hidden">
                {!provider.approved && !provider.blocked && (
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs font-medium"
                    onClick={() => void handleApprove()}
                    disabled={isMutating || !canApproveAccount(provider)}
                    title={
                      !canApproveAccount(provider)
                        ? 'Requires complete profile and approved ID, company registration, and proof of address'
                        : undefined
                    }
                  >
                    {isMutating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                    Approve
                  </Button>
                )}
                {canAdminUnrejectProvider(provider) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => void handleUnreject()}
                    disabled={isMutating}
                  >
                    {isMutating ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 h-3 w-3" />
                    )}
                    Unreject
                  </Button>
                )}
                {!provider.approved && !provider.blocked && !isProviderApplicationRejected(provider) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => setRejectModalOpen(true)}
                    disabled={isMutating || !canAdminActOnProviderApplication(provider)}
                    title={
                      !canAdminActOnProviderApplication(provider)
                        ? 'Provider must complete their profile and submit for review before you can reject'
                        : undefined
                    }
                  >
                    <X className="mr-1 h-3 w-3" />
                    Reject
                  </Button>
                )}
                {provider.blocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => void handleUnblock()}
                    disabled={isMutating}
                  >
                    {isMutating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    Unblock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => setBlockModalOpen(true)}
                    disabled={isMutating}
                  >
                    <Ban className="mr-1 h-3 w-3" />
                    Block
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs text-destructive"
                  onClick={() => setDeleteModalOpen(true)}
                  disabled={isMutating}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6 border-b border-border px-6 py-6">
            <div>
              <h2 className="mb-4 text-lg font-semibold">Job activity</h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {[
                  { label: 'Completed', value: analytics?.jobCounts.completed },
                  { label: 'Pending', value: analytics?.jobCounts.pending },
                  { label: 'Active', value: analytics?.jobCounts.active },
                  { label: 'Disputed', value: analytics?.jobCounts.disputed },
                  { label: 'Cancelled', value: analytics?.jobCounts.cancelled },
                ].map((stat) => (
                  <div key={stat.label} className="card-elevated p-4">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {isAnalyticsLoading ? '—' : (stat.value ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-1 text-lg font-semibold">Earnings &amp; payouts</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Amounts match the provider Earnings page (ZAR).
              </p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  {
                    label: 'Total earnings',
                    value: isAnalyticsLoading
                      ? '—'
                      : formatCurrency(analytics?.financial.totalEarnings ?? 0),
                    isMoney: true,
                  },
                  {
                    label: 'Released by platform',
                    value: isAnalyticsLoading
                      ? '—'
                      : formatCurrency(analytics?.financial.releasedByPlatform ?? 0),
                    isMoney: true,
                  },
                  {
                    label: 'Available to withdraw',
                    value: isAnalyticsLoading
                      ? '—'
                      : formatCurrency(analytics?.financial.availableToWithdraw ?? 0),
                    isMoney: true,
                  },
                  {
                    label: 'Remaining in escrow',
                    value: isAnalyticsLoading
                      ? '—'
                      : formatCurrency(analytics?.financial.remainingInEscrow ?? 0),
                    isMoney: true,
                  },
                ].map((stat) => (
                  <div key={stat.label} className="card-elevated min-w-0 p-4">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p
                      className={cn(
                        'mt-1 font-semibold leading-tight tabular-nums truncate',
                        stat.isMoney && 'text-base sm:text-lg lg:text-xl',
                      )}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 grid md:grid-cols-2 gap-6">
            <div className="space-y-4 border-2 border-primary rounded-lg p-4">
              <div className="border-b-2 border-primary/20 pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Contact Details
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    {provider.email}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {provider.phone || '—'}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    {provider.city || '—'}
                    {provider.serviceAreas?.length ? ` • ${provider.serviceAreas.join(', ')}` : ''}
                  </p>
                </div>
              </div>

              <div className="border-b-2 border-primary/20 pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Services Offered
                </h3>
                <div className="flex flex-col gap-1 text-sm">
                  {serviceNames.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                  {pendingServiceSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() =>
                        navigate('/admin/categories', {
                          state: {
                            providerId: provider.profileId || '',
                            suggestionId: suggestion.id,
                          },
                        })
                      }
                      className="w-fit text-left text-orange-700 underline decoration-dotted underline-offset-2 dark:text-orange-300"
                    >
                      {suggestion.name} (Pending)
                    </button>
                  ))}
                  {serviceNames.length === 0 && pendingServiceSuggestions.length === 0 && (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </div>
              </div>

              <div className="border-b-2 border-primary/20 pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Registration Date
                </h3>
                <p className="text-sm">{new Date(provider.createdAt).toLocaleDateString()}</p>
              </div>

              <div className="pb-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Ratings
                </h3>
                <p className="text-sm">
                  {provider.rating > 0 ? `${provider.rating.toFixed(1)} / 5` : 'N/A'}{' '}
                  ({provider.completedJobs} completed jobs)
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(provider.totalReviews ?? provider.reviews?.length ?? 0).toLocaleString()} review
                  {(provider.totalReviews ?? provider.reviews?.length ?? 0) === 1 ? '' : 's'}
                </p>
                {(provider.totalReviews ?? provider.reviews?.length ?? 0) > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void openCustomerReviewsDialog()}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    View customer reviews
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Images className="h-4 w-4" />
                  Work posts
                </h3>
                {(provider.workPosts?.length ?? 0) > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {provider.workPosts!.map((post) => {
                      const cat = categories.find((c) => c.id === post.categoryId);
                      const imgs = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
                      return (
                        <div
                          key={post.id}
                          className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm transition hover:shadow-md"
                        >
                          <div className="space-y-1">
                            <p className="text-base font-semibold leading-tight">{post.title}</p>
                            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                              <span>
                                {cat ? `${cat.icon} ${cat.name}` : post.categoryId}
                              </span>
                              {!cat ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  title="Create category from this name"
                                  onClick={() =>
                                    navigate('/admin/categories', {
                                      state: { prefill: { name: post.categoryId } },
                                    })
                                  }
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          {imgs.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {imgs.map((url, idx) => (
                                <button
                                  key={`${post.id}-${idx}`}
                                  type="button"
                                  onClick={() => openImagePreview(url)}
                                  className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <img
                                    src={resolveUploadUrl(url)}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No images for this post</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">No work uploaded yet</div>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Verification documents
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Approve all required documents before activating the provider account.
                </p>

                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Required
                </p>
                <div className="mb-6 space-y-3">
                  {REQUIRED_PROVIDER_DOCUMENTS.map(({ id: docId, label }) => {
                    const doc = provider.documents[docId];
                    const hasUrl = Boolean(doc?.url?.trim());
                    return (
                      <AdminDocumentRow
                        key={docId}
                        label={label}
                        doc={doc}
                        hasUrl={hasUrl}
                        providerBlocked={provider.blocked}
                        isMutating={isMutating}
                        onApprove={() => void handleApproveDocument(docId)}
                        onReject={() => {
                          setDocRejectTarget(docId);
                          setDocRejectFeedback('');
                        }}
                      />
                    );
                  })}
                </div>

                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Optional
                </p>
                <div className="space-y-3">
                  {ADMIN_OPTIONAL_PROVIDER_DOCUMENTS.map(({ id: docId, label }) => {
                    const doc = provider.documents[docId];
                    const hasUrl = Boolean(doc?.url?.trim());
                    return (
                      <AdminDocumentRow
                        key={docId}
                        label={label}
                        doc={doc}
                        hasUrl={hasUrl}
                        providerBlocked={provider.blocked}
                        isMutating={isMutating}
                        onApprove={() => void handleApproveDocument(docId)}
                        onReject={() => {
                          setDocRejectTarget(docId);
                          setDocRejectFeedback('');
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {provider.rejectionReason && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="font-medium text-sm text-destructive">Rejection Reason</p>
                  <p className="text-sm mt-1">{provider.rejectionReason}</p>
                  {provider.rejectedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Rejected on {new Date(provider.rejectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog
          open={reviewsDialogOpen}
          onOpenChange={setReviewsDialogOpen}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Customer reviews — {provider.name}</DialogTitle>
              <DialogDescription>
                {reviewsSummary.totalReviews > 0
                  ? `${reviewsSummary.averageRating.toFixed(1)} avg · ${reviewsSummary.totalReviews} review${reviewsSummary.totalReviews === 1 ? '' : 's'}`
                  : 'Reviews from customers after job confirmation or reported issues.'}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <ProviderReviewList reviews={customerReviews} loading={reviewsLoading} />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!imagePreviewUrl}
          onOpenChange={(open) => {
            if (!open) setImagePreviewUrl(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Preview</DialogTitle>
              <DialogDescription>
                For PDFs, use &quot;Open in new tab&quot; if the preview does not render.
              </DialogDescription>
            </DialogHeader>
            {imagePreviewUrl ? (
              <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-2">
                <img
                  src={imagePreviewUrl}
                  alt=""
                  className="mx-auto max-h-[65vh] w-auto max-w-full object-contain"
                />
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (imagePreviewUrl) window.open(imagePreviewUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                Open in new tab
              </Button>
              <Button type="button" onClick={() => setImagePreviewUrl(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!docRejectTarget}
          onOpenChange={(open) => {
            if (!open) {
              setDocRejectTarget(null);
              setDocRejectFeedback('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject document</DialogTitle>
              <DialogDescription>
                Optional feedback for the provider (e.g. what to fix before re-uploading).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="doc-reject-feedback">Feedback</Label>
              <Textarea
                id="doc-reject-feedback"
                value={docRejectFeedback}
                onChange={(e) => setDocRejectFeedback(e.target.value)}
                rows={3}
                placeholder="e.g. ID photo is blurry — please upload a clearer image."
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDocRejectTarget(null);
                  setDocRejectFeedback('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isMutating}
                onClick={() => void handleRejectDocumentSubmit()}
              >
                {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reject document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Modal */}
        <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Provider</DialogTitle>
              <DialogDescription>
                Provide a reason for rejection. The provider will see this and can upload new documents.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="reject-reason">Reason (required)</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="e.g. Document quality is unclear. Please upload a clearer copy."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="mt-2"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleReject()} disabled={!rejectReason.trim() || isMutating}>
                {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reject Provider
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Block Modal */}
        <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Block Provider</DialogTitle>
              <DialogDescription>
                Blocked providers can still sign in and view history, but cannot receive new requests or
                withdraw funds until unblocked.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="provider-block-reason">Reason (required)</Label>
              <Textarea
                id="provider-block-reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Explain why this provider is being blocked…"
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBlockModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleBlock()} disabled={!blockReason.trim() || isMutating}>
                {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Block Provider
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Modal */}
        <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Provider</DialogTitle>
              <DialogDescription>
                This will soft delete the provider. They will no longer appear in the active list. This action can be reversed by re-adding the provider.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={isMutating}>
                {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete Provider
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
