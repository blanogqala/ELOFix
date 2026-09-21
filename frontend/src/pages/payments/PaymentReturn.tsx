import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { confirmPaymentReturn, getPaymentIntent, PaymentIntent } from '@/lib/api/payments';
import { getJobById, payForStoreMaterials } from '@/lib/api/jobs';
import { CheckCircle, Copy, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  paymentProviderDisplayName,
  paymentSuccessCopy,
  paymentSuccessDonePath,
  paymentSuccessReceiptPath,
} from '@/lib/paymentSuccessPresentation';
import { format, parseISO } from 'date-fns';

const MAX_POLL_ATTEMPTS = 24;
const POLL_INTERVAL_MS = 2500;

function formatPaidAt(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'd MMM yyyy · HH:mm');
  } catch {
    return iso;
  }
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? 'min-w-0 break-all text-right font-mono text-sm font-medium'
            : 'min-w-0 break-words text-right text-sm font-medium'
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const intentId = searchParams.get('intentId') || '';
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!intentId) {
      setLoading(false);
      setMessage('Missing payment reference. Return to your job or dashboard.');
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const applyJobStoreFallback = async (row: PaymentIntent) => {
      if (row.state !== 'PAID' || row.kind !== 'JOB_STORE_ORDER' || !row.jobId || !row.metadata) {
        return;
      }
      const meta = row.metadata as {
        supplierId?: string;
        deliveryType?: 'SELF' | 'STORE' | 'PROVIDER';
        deliveryFee?: number;
        deliveryProviderId?: string;
        orderId?: string;
      };
      if (!meta.supplierId) return;
      try {
        await payForStoreMaterials(row.jobId, meta.supplierId, row.id, {
          deliveryType: meta.deliveryType || 'SELF',
          deliveryFee: Number(meta.deliveryFee || 0),
          deliveryProviderId: meta.deliveryProviderId,
          orderId: meta.orderId,
        });
      } catch {
        /* webhook or prior return may have already applied */
      }
    };

    const loadJobLabel = async (row: PaymentIntent) => {
      if (!row.jobId) {
        setJobLabel(null);
        return;
      }
      try {
        const job = await getJobById(row.jobId);
        if (cancelled) return;
        const label = String(job?.categoryName || job?.category || '').trim();
        setJobLabel(label || null);
      } catch {
        if (!cancelled) setJobLabel(null);
      }
    };

    const poll = async () => {
      if (cancelled) return;
      pollCountRef.current += 1;

      try {
        await confirmPaymentReturn(intentId);
        const row = await getPaymentIntent(intentId);
        if (cancelled) return;
        setIntent(row);

        if (row.state === 'PAID') {
          await applyJobStoreFallback(row);
          await loadJobLabel(row);
          const copy = paymentSuccessCopy(row);
          setMessage(copy.description);
          setLoading(false);
          setTimedOut(false);
          return;
        }

        if (row.state === 'FAILED' || row.state === 'CANCELLED') {
          setMessage(
            row.state === 'CANCELLED'
              ? 'Payment was cancelled.'
              : 'Payment failed. You can try again from your job.'
          );
          setLoading(false);
          return;
        }

        setMessage('Payment is being processed. This may take a minute.');

        if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
          setTimedOut(true);
          setLoading(false);
          setMessage(
            'Payment received but confirmation is taking longer than expected. Your reference is below — refresh this page in a minute or contact support if the job does not update.'
          );
          return;
        }
      } catch {
        if (!cancelled) {
          if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
            setTimedOut(true);
            setLoading(false);
            setMessage('Unable to verify payment status. Please refresh or contact support with your reference.');
          } else {
            setMessage('Checking payment status…');
          }
        }
      }

      if (!cancelled && pollCountRef.current < MAX_POLL_ATTEMPTS) {
        timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [intentId]);

  const isPaid = intent?.state === 'PAID';
  const isFailed = intent?.state === 'FAILED' || intent?.state === 'CANCELLED';
  const copy = intent ? paymentSuccessCopy(intent) : null;
  const donePath = intent
    ? paymentSuccessDonePath({
        jobId: intent.jobId,
        materialOrderId: intent.materialOrderId,
        kind: intent.kind,
        paymentType: intent.paymentType,
        role: user?.role,
      })
    : user?.role === 'provider'
      ? '/provider/dashboard'
      : '/user/dashboard';
  const receiptPath = intent
    ? paymentSuccessReceiptPath({
        paymentIntentId: intent.id,
        jobId: intent.jobId,
        kind: intent.kind,
        paymentType: intent.paymentType,
        role: user?.role,
      })
    : '/user/payments';
  const paidAtLabel = formatPaidAt(intent?.paidAt);
  const methodLabel = paymentProviderDisplayName(intent?.provider);
  const amountLabel =
    intent && Number.isFinite(Number(intent.amount))
      ? formatCurrency(Number(intent.amount), { decimals: 2 })
      : null;

  const copyReference = async () => {
    const ref = intent?.merchantReference;
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(ref);
      toast({ title: 'Copied', description: 'Payment reference copied.' });
    } catch {
      toast({ title: 'Could not copy reference', variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full min-w-0 max-w-[520px] overflow-x-hidden px-4 py-8 sm:py-12">
        {isPaid && copy && !loading ? (
          <Card className="min-w-0 overflow-hidden rounded-xl shadow-md">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="flex flex-col items-center text-center" role="status">
                <div
                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10"
                  aria-hidden="true"
                >
                  <CheckCircle className="h-10 w-10 text-success" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {copy.title}
                </h1>
                {amountLabel ? (
                  <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
                    {amountLabel}
                  </p>
                ) : null}
                <p className="mt-2 max-w-sm text-sm text-muted-foreground sm:text-base">
                  {copy.description}
                </p>
              </div>

              <dl className="space-y-3 rounded-lg bg-muted/60 p-4">
                {jobLabel ? <DetailRow label="Job" value={jobLabel} /> : null}
                <DetailRow label="Payment" value={copy.paymentLabel} />
                {intent?.merchantReference ? (
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <dt className="shrink-0 text-sm text-muted-foreground">Reference</dt>
                    <dd className="flex min-w-0 items-start justify-end gap-2">
                      <span className="min-w-0 break-all text-right font-mono text-sm font-medium">
                        {intent.merchantReference}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Copy payment reference"
                        onClick={() => void copyReference()}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </dd>
                  </div>
                ) : null}
                {paidAtLabel ? <DetailRow label="Date" value={paidAtLabel} /> : null}
                {methodLabel ? <DetailRow label="Paid with" value={methodLabel} /> : null}
              </dl>

              <div className="space-y-2">
                <Button asChild className="w-full">
                  <Link to={donePath}>
                    Done
                  </Link>
                </Button>
                <Button asChild variant="link" className="h-auto w-full text-primary">
                  <Link to={receiptPath}>
                    View receipt
                  </Link>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {copy.isProviderRefundRepayment
                    ? 'Receipt available on the refund repayment page'
                    : 'Receipt available in Payments'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-xl shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                {loading && !timedOut && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                {(isFailed || timedOut) && !isPaid && (
                  <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
                )}
                Payment{' '}
                {loading && !timedOut
                  ? 'processing'
                  : isFailed
                    ? 'failed'
                    : timedOut
                      ? 'pending confirmation'
                      : 'status'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{message || 'Checking payment status…'}</p>
              {intent?.merchantReference ? (
                <p className="min-w-0 break-all text-sm">
                  Reference: <span className="font-mono">{intent.merchantReference}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {timedOut && intentId ? (
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Refresh status
                  </Button>
                ) : null}
                {intent?.jobId && (isFailed || timedOut) ? (
                  <Button asChild>
                    <Link
                      to={
                        user?.role === 'provider'
                          ? `/provider/jobs/${intent.jobId}`
                          : `/user/jobs/${intent.jobId}`
                      }
                    >
                      Back to job
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
