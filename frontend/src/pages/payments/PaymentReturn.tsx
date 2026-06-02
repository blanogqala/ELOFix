import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { confirmPaymentReturn, getPaymentIntent, PaymentIntent } from '@/lib/api/payments';
import { payForStoreMaterials } from '@/lib/api/jobs';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

const MAX_POLL_ATTEMPTS = 24;
const POLL_INTERVAL_MS = 2500;

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const intentId = searchParams.get('intentId') || '';
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
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
          setMessage('Payment confirmed. Thank you!');
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

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {loading && !timedOut && <Loader2 className="h-5 w-5 animate-spin" />}
              {isPaid && <CheckCircle className="h-5 w-5 text-green-600" />}
              {(isFailed || timedOut) && !isPaid && <XCircle className="h-5 w-5 text-destructive" />}
              Payment{' '}
              {loading && !timedOut
                ? 'processing'
                : isPaid
                  ? 'successful'
                  : isFailed
                    ? 'failed'
                    : timedOut
                      ? 'pending confirmation'
                      : 'status'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{message || 'Checking payment status…'}</p>
            {intent && (
              <p className="text-sm">
                Reference: <span className="font-mono">{intent.merchantReference}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {intent?.jobId && (
                <Button asChild variant="default">
                  <Link to={`/user/jobs/${intent.jobId}`}>Back to job</Link>
                </Button>
              )}
              {intent?.materialOrderId && (
                <Button asChild variant="default">
                  <Link to={`/user/material-orders/${intent.materialOrderId}`}>View order</Link>
                </Button>
              )}
              {timedOut && intentId && (
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Refresh status
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/user/dashboard')}>
                Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
