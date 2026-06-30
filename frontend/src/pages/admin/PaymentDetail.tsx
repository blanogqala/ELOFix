import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getJobById, releaseEscrowPayment } from '@/lib/api/jobs';
import { getLaborInvoiceByJobId } from '@/lib/api/jobs';
import { processAdminJobRefund } from '@/lib/api/payments';
import { LoadingOverlay } from '@/components/common/loading';
import { getAdminEscrowV2Breakdown } from '@/lib/adminJobFinancial';
import { Job } from '@/types';
import {
  ArrowLeft,
  User,
  Briefcase,
  Clock,
  CheckCircle,
  FileText,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { AdminJobPaymentBreakdownCard } from '@/components/admin/AdminJobPaymentBreakdownCard';
import { buildAdminJobTransactionHistory, canAdminManualReleaseEscrow } from '@/lib/adminJobFinancial';
import { getAdminPaymentStatusDisplay } from '@/lib/adminJobStatus';
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

export default function AdminPaymentDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseAmount, setReleaseAmount] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);
  const [refundLabor, setRefundLabor] = useState('');
  const [refundMaterials, setRefundMaterials] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getJobById(jobId);
      setJob(data || null);
    } catch (error) {
      console.error('Failed to load payment:', error);
      toast({ title: 'Error', description: 'Failed to load payment.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [jobId, toast]);

  useEffect(() => {
    if (jobId) {
      void loadJob();
    }
  }, [jobId, loadJob]);

  const getPaymentStatus = () => {
    if (!job) return { label: 'Unknown', class: 'text-muted-foreground' };
    return getAdminPaymentStatusDisplay(job);
  };

  const getMaxReleasable = () => {
    if (!job) return 0;
    return job.escrow.heldAmount || 0;
  };

  const handleProcessRefund = async () => {
    if (!job) return;
    const labor = parseFloat(refundLabor);
    const materials = parseFloat(refundMaterials || '0');
    if (Number.isNaN(labor) || labor < 0 || Number.isNaN(materials) || materials < 0) {
      toast({ title: 'Enter valid refund amounts', variant: 'destructive' });
      return;
    }
    if (labor === 0 && materials === 0) {
      toast({ title: 'At least one amount must be greater than zero', variant: 'destructive' });
      return;
    }
    setRefundBusy(true);
    try {
      const updated = await processAdminJobRefund(job.id, {
        laborRefundNet: labor,
        materialsRefundNet: materials,
      });
      setJob(updated);
      toast({
        title: 'Refund processed',
        description: 'Customer refund recorded and provider clawback applied.',
      });
      setRefundLabor('');
      setRefundMaterials('');
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to process refund.',
        variant: 'destructive',
      });
    } finally {
      setRefundBusy(false);
    }
  };

  const laborGross =
    job?.totalPrice != null && Number(job.totalPrice) > 0
      ? Number(job.totalPrice)
      : Number(job?.servicePrice?.amount ?? 0);
  const priorRefunded = Number(job?.refundAmount ?? 0) || 0;
  const maxNetLabor = Math.max(0, Math.round(laborGross * 0.93 * 100) / 100 - priorRefunded);
  const laborPreview = parseFloat(refundLabor);
  const finBreakdown = job ? getAdminEscrowV2Breakdown(job) : null;
  const previewEscrow =
    finBreakdown && Number.isFinite(laborPreview) && laborPreview > 0
      ? Math.min(laborPreview, finBreakdown.remaining)
      : 0;
  const previewClawback =
    Number.isFinite(laborPreview) && laborPreview > 0
      ? Math.max(0, laborPreview - previewEscrow)
      : 0;
  const paymentMethodHint =
    job?.servicePayment?.maskedPaymentMethod?.replace(/\D/g, '').slice(-4) || 'from payment record';

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
          <Button variant="ghost" onClick={() => navigate('/admin/payments')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Payments
          </Button>
          <div className="card-elevated p-12 text-center">
            <p className="text-muted-foreground">Payment not found</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const paymentStatus = getPaymentStatus();
  const maxReleasable = getMaxReleasable();
  const canReleaseEscrow = canAdminManualReleaseEscrow(job);

  const transactionHistory = buildAdminJobTransactionHistory(job);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/admin/payments')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Payments
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Job Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium">{job.categoryName}</p>
              <p className="text-sm text-muted-foreground font-mono">#{job.id}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Payer & Receiver
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">User (Payer)</p>
                <p className="font-medium">{job.userName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Provider (Receiver)</p>
                <p className="font-medium">{job.providerName || '—'}</p>
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
              {maxReleasable > 0 && canReleaseEscrow && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setReleaseAmount(String(maxReleasable));
                    setReleaseModalOpen(true);
                  }}
                >
                  Release remaining funds
                </Button>
              )}
              {maxReleasable > 0 && !canReleaseEscrow && (
                <p className="text-sm text-muted-foreground">
                  Courier delivery funds are held until the customer confirms delivery.
                </p>
              )}
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Process refund</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the net amount to send the customer (max 93% of labor gross). Platform keeps 7%
              commission. Provider funds the refund from escrow, available balance, then future earnings.
            </p>
            {priorRefunded > 0 && (
              <p className="text-sm text-muted-foreground">
                Already refunded: {formatCurrency(priorRefunded)} · Remaining max: {formatCurrency(maxNetLabor)}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="refund-labor">Labor refund net (R)</Label>
                <Input
                  id="refund-labor"
                  type="number"
                  min={0}
                  max={maxNetLabor}
                  step={0.01}
                  value={refundLabor}
                  onChange={(e) => setRefundLabor(e.target.value)}
                  placeholder={maxNetLabor > 0 ? String(maxNetLabor) : '0'}
                />
                <p className="text-xs text-muted-foreground">Max net: {formatCurrency(maxNetLabor)}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="refund-mat">Materials refund net (R)</Label>
                <Input
                  id="refund-mat"
                  type="number"
                  min={0}
                  step={0.01}
                  value={refundMaterials}
                  onChange={(e) => setRefundMaterials(e.target.value)}
                />
              </div>
            </div>
            {Number.isFinite(laborPreview) && laborPreview > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">Preview</p>
                <p className="text-muted-foreground">
                  From escrow held: {formatCurrency(previewEscrow)}
                </p>
                <p className="text-muted-foreground">
                  Provider clawback (available first, then debt): {formatCurrency(previewClawback)}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Payment method: card ···{paymentMethodHint} · Gateway refund attempted when configured
            </p>
            <Button onClick={() => void handleProcessRefund()} disabled={refundBusy || !job.laborPaid}>
              {refundBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {refundBusy ? 'Processing…' : 'Process refund'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Transaction History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactionHistory.length > 0 ? (
              <div className="space-y-3">
                {transactionHistory.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{tx.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.date).toLocaleString()} • {tx.by}
                      </p>
                    </div>
                    <span className="font-medium">{formatCurrency(tx.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No transactions yet</p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/admin/jobs/${job.id}`)}>
            <FileText className="mr-2 h-4 w-4" />
            View Job Details
          </Button>
        </div>

        <Dialog open={releaseModalOpen} onOpenChange={setReleaseModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Release Payment</DialogTitle>
              <DialogDescription>
                Release funds from escrow to the provider. Max releasable: {formatCurrency(maxReleasable)}.
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
                {isReleasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isReleasing ? 'Releasing...' : 'Release Payment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <LoadingOverlay
          open={isReleasing || refundBusy}
          message={isReleasing ? 'Releasing escrow…' : 'Processing refund…'}
        />
      </div>
    </DashboardLayout>
  );
}
