import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  createProviderRefundRepaymentCheckout,
  getProviderJobRefundObligation,
  submitProviderRefundRepayment,
  type ProviderJobRefundObligation,
} from '@/lib/api/providerAccount';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatPersonDisplayName } from '@/lib/displayPersonName';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { resolveProviderRefundDisplay } from '@/lib/refundStatusDisplay';

function statusLabelFromObligation(obligation: ProviderJobRefundObligation): string {
  const display = resolveProviderRefundDisplay({
    amountDue: obligation.amountDue,
    pendingRepayment: obligation.pendingRepayment,
    repaymentStatus: obligation.repaymentStatus,
    customerRefundStatus: obligation.customerRefundStatus,
    jobId: obligation.jobId,
  });
  if (display.mode === 'required') return 'Payment required';
  if (display.label) return display.label;
  switch (String(obligation.repaymentStatus || '').toUpperCase()) {
    case 'AWAITING_VERIFICATION':
      return 'Repayment submitted — awaiting EloFix verification';
    case 'PAYMENT_REJECTED':
      return 'Repayment rejected — resubmit';
    case 'REFUND_PROCESSING':
      return 'Repayment verified — customer refund pending';
    case 'REFUNDED':
      return 'Customer refund completed';
    case 'OVERDUE':
      return 'Overdue — payment required';
    case 'REFUND_DUE':
    default:
      return 'Payment required';
  }
}

function redirectCheckout(checkout: {
  type: string;
  url: string;
  method?: string;
  formFields?: Record<string, string>;
}) {
  if (checkout.method === 'POST' && checkout.formFields && typeof document !== 'undefined') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = checkout.url;
    for (const [k, v] of Object.entries(checkout.formFields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = String(v);
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return;
  }
  window.location.href = checkout.url;
}

export default function ProviderJobRefundRepayment() {
  const { id: jobId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [obligation, setObligation] = useState<ProviderJobRefundObligation | null>(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showEft, setShowEft] = useState(false);

  const load = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await getProviderJobRefundObligation(jobId);
      setObligation(res.obligation);
      setReference(res.obligation.reference || '');
    } catch (e) {
      toast({
        title: 'Could not load refund obligation',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
      setObligation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (searchParams.get('cancelled') === '1') {
      toast({
        title: 'Payment cancelled',
        description: 'You can try again when ready.',
      });
    } else if (searchParams.get('intentId')) {
      toast({
        title: 'Payment submitted',
        description: 'If payment succeeded, EloFix will verify it shortly.',
      });
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handlePay = async () => {
    if (!obligation || !jobId) return;
    if (obligation.amountDue <= 0) {
      toast({ title: 'No amount due for this obligation', variant: 'destructive' });
      return;
    }
    setPaying(true);
    try {
      const data = await createProviderRefundRepaymentCheckout(jobId, {
        amount: obligation.amountDue,
      });
      if (!data.checkout?.url) {
        throw new Error('Checkout URL missing from payment gateway');
      }
      redirectCheckout(data.checkout);
    } catch (e) {
      toast({
        title: 'Could not start payment',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
      setPaying(false);
    }
  };

  const handleSubmitEft = async () => {
    if (!obligation || !jobId) return;
    if (!reference.trim()) {
      toast({ title: 'Payment reference is required', variant: 'destructive' });
      return;
    }
    if (obligation.amountDue <= 0) {
      toast({ title: 'No amount due for this obligation', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await submitProviderRefundRepayment({
        amount: obligation.amountDue,
        reference: reference.trim(),
        jobId,
      });
      toast({
        title: 'Repayment submitted',
        description: 'EloFix will confirm once the transfer is verified. Customer refund is not complete yet.',
      });
      await load();
    } catch (e) {
      toast({
        title: 'Could not submit repayment',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!obligation || !jobId) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl space-y-4 p-4">
          <Button variant="ghost" asChild>
            <Link to="/provider/earnings">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to earnings
            </Link>
          </Button>
          <p className="text-muted-foreground">No refund obligation found for this job.</p>
        </div>
      </DashboardLayout>
    );
  }

  const pending = Boolean(obligation.pendingRepayment);
  const display = resolveProviderRefundDisplay({
    amountDue: obligation.amountDue,
    pendingRepayment: obligation.pendingRepayment,
    repaymentStatus: obligation.repaymentStatus,
    customerRefundStatus: obligation.customerRefundStatus,
    jobId: obligation.jobId,
  });
  const canPay = display.showRepayCta && obligation.amountDue > 0;
  const bank = obligation.platformBank;
  const amountLabel = formatCurrency(obligation.amountDue, { decimals: 2 });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/provider/jobs/${jobId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to job
            </Link>
          </Button>
        </div>

        <div className="card-elevated space-y-4 p-5 sm:p-6">
          <h1 className="text-xl font-semibold sm:text-2xl">Refund repayment</h1>
          <p className="text-sm text-muted-foreground">
            Payment status:{' '}
            <span className="font-medium text-foreground">
              {statusLabelFromObligation(obligation)}
            </span>
          </p>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Job</dt>
              <dd className="font-medium">{obligation.jobTitle || `Job #${jobId.slice(-8)}`}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="font-medium">
                {formatPersonDisplayName(obligation.customerName) || 'Customer'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Refund obligation</dt>
              <dd className="text-lg font-semibold tabular-nums text-destructive">{amountLabel}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="font-medium">Customer refund approved by EloFix admin</dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Pay EloFix securely through the payment gateway. Your Profile → Payout &amp; Banking
            details are for receiving settlements only — they are not used to debit your account.
            Customer card numbers and CVV are never shown to you.
          </p>

          {pending ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Repayment submitted — awaiting EloFix verification (
              {formatCurrency(obligation.pendingRepayment!.amount, { decimals: 2 })}). Customer
              refund is not complete until verification and gateway processing succeed.
            </p>
          ) : null}

          {canPay ? (
            <div className="space-y-3">
              <Button
                className="w-full sm:w-auto"
                disabled={paying}
                onClick={() => void handlePay()}
              >
                {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Pay {amountLabel}
              </Button>

              <div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowEft((v) => !v)}
                >
                  {showEft ? 'Hide' : 'Prefer'} bank transfer instead
                </button>
              </div>

              {showEft ? (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Bank transfer (fallback)</p>
                  <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                    <p>
                      {bank.bankName} — {bank.accountName}
                    </p>
                    <p className="tabular-nums">
                      Acc {bank.accountNumber} · Branch {bank.branchCode} · {bank.accountType}
                    </p>
                    {obligation.reference ? (
                      <p className="text-xs text-muted-foreground">
                        Use reference:{' '}
                        <span className="font-mono text-foreground">{obligation.reference}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="job-refund-amount">Amount (ZAR)</Label>
                      <Input
                        id="job-refund-amount"
                        type="text"
                        readOnly
                        value={amountLabel}
                        className="bg-muted/50 tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="job-refund-ref">Payment reference</Label>
                      <Input
                        id="job-refund-ref"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="EFT reference"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button
                        variant="secondary"
                        disabled={submitting}
                        onClick={() => void handleSubmitEft()}
                      >
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Submit bank transfer repayment
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {display.mode === 'customer_completed' ||
          String(obligation.repaymentStatus).toUpperCase() === 'REFUNDED' ||
          String(obligation.customerRefundStatus || '').toUpperCase() === 'REFUND_COMPLETED' ? (
            <p className="text-sm text-success">This refund obligation is complete.</p>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
