import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getJobById, releaseEscrowPayment } from '@/lib/api/jobs';
import { getLaborInvoiceByJobId } from '@/lib/api/jobs';
import { createRefundInvoice } from '@/lib/api/payments';
import { Job } from '@/types';
import {
  ArrowLeft,
  User,
  Briefcase,
  Clock,
  CheckCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { AdminJobPaymentBreakdownCard } from '@/components/admin/AdminJobPaymentBreakdownCard';
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
  const [refundCardLast4, setRefundCardLast4] = useState('');
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

  const handleRecordRefundInvoice = async () => {
    if (!job) return;
    const labor = parseFloat(refundLabor);
    const materials = parseFloat(refundMaterials);
    if (Number.isNaN(labor) || labor < 0 || Number.isNaN(materials) || materials < 0) {
      toast({ title: 'Enter valid refund amounts', variant: 'destructive' });
      return;
    }
    if (labor === 0 && materials === 0) {
      toast({ title: 'At least one amount must be greater than zero', variant: 'destructive' });
      return;
    }
    const last4 = refundCardLast4.replace(/\D/g, '').slice(-4);
    if (last4.length !== 4) {
      toast({ title: 'Enter card last 4 digits', variant: 'destructive' });
      return;
    }
    setRefundBusy(true);
    try {
      await createRefundInvoice(job.userId, job.id, labor, materials, last4);
      toast({ title: 'Refund invoice recorded', description: 'Visible on the customer invoices list.' });
      setRefundLabor('');
      setRefundMaterials('');
      setRefundCardLast4('');
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to record refund.',
        variant: 'destructive',
      });
    } finally {
      setRefundBusy(false);
    }
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
  const releasedAmount = job.escrow.releasedAmount || 0;
  const maxReleasable = getMaxReleasable();

  const transactionHistory: { type: string; amount: number; date: string; by: string }[] = [];
  if (job.servicePayment) {
    transactionHistory.push({
      type: 'Labor Payment',
      amount: job.servicePayment.amount,
      date: job.servicePayment.paidAt,
      by: job.servicePayment.paidBy,
    });
  }
  if (releasedAmount > 0) {
    transactionHistory.push({
      type: 'Escrow release (meta)',
      amount: releasedAmount,
      date: new Date().toISOString(),
      by: 'Admin',
    });
  }

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
              {maxReleasable > 0 && (
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
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Record refund invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates a refund line item record for the customer (e.g. after a partial cancellation). Totals should match your finance process.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="refund-labor">Labor refund (R)</Label>
                <Input
                  id="refund-labor"
                  type="number"
                  min={0}
                  step={1}
                  value={refundLabor}
                  onChange={(e) => setRefundLabor(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="refund-mat">Materials refund (R)</Label>
                <Input
                  id="refund-mat"
                  type="number"
                  min={0}
                  step={1}
                  value={refundMaterials}
                  onChange={(e) => setRefundMaterials(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1 max-w-xs">
              <Label htmlFor="refund-card">Card last 4</Label>
              <Input
                id="refund-card"
                inputMode="numeric"
                maxLength={4}
                value={refundCardLast4}
                onChange={(e) => setRefundCardLast4(e.target.value)}
                placeholder="4242"
              />
            </div>
            <Button onClick={() => void handleRecordRefundInvoice()} disabled={refundBusy}>
              {refundBusy ? 'Saving…' : 'Save refund invoice'}
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
                {isReleasing ? 'Releasing...' : 'Release Payment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
