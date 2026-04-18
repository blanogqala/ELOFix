import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getJobById, releaseEscrowPayment } from '@/lib/api/jobs';
import { getLaborInvoiceByJobId } from '@/lib/api/jobs';
import { Job } from '@/types';
import {
  ArrowLeft,
  DollarSign,
  User,
  Briefcase,
  Clock,
  CheckCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
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
    const held = job.escrow.heldAmount || 0;
    const released = job.escrow.releasedAmount || 0;
    const total = held + released;
    if (job.status === 'COMPLETED') return held;
    return Math.min(held, Math.max(0, Math.floor(total * 0.5) - released));
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
  const heldAmount = job.escrow.heldAmount || 0;
  const releasedAmount = job.escrow.releasedAmount || 0;
  const totalAmount = job.servicePrice?.amount ?? job.totalEstimateRange.min;
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
      type: 'Escrow Release',
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Job Amount</span>
              <span className="font-semibold">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Amount Already Released</span>
              <span>{formatCurrency(releasedAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Remaining Balance</span>
              <span>{formatCurrency(heldAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment Status</span>
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
                Release Remaining Funds
              </Button>
            )}
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
