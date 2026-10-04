import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  getPublicTracking,
  isTrackingGoneError,
  type PublicTrackingMeta,
} from '@/lib/api/tracking';
import { DeliveryMap } from '@/components/tracking/DeliveryMap';
import { ApiHttpError } from '@/api/client';

export default function TrackDeliveryPage() {
  const { trackingId } = useParams<{ trackingId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || searchParams.get('access_token');
  const [meta, setMeta] = useState<PublicTrackingMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!trackingId) return;
    let cancelled = false;
    getPublicTracking(trackingId, token)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) {
          let msg =
            'This tracking link is invalid, expired, or tracking session ended.';
          if (isTrackingGoneError(e)) {
            msg = 'Tracking session expired or ended. Ask for a new link if delivery is still active.';
          } else if (e instanceof ApiHttpError) {
            if (e.status >= 500) msg = 'Server error loading tracking. Please try again.';
            else if (
              !e.status ||
              String(e.message || '')
                .toLowerCase()
                .includes('network')
            ) {
              msg = 'Unable to fetch tracking. Check your network connection.';
            }
          }
          setErr(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trackingId, token]);

  const sessionEnded =
    meta &&
    (!meta.isActive || Boolean(meta.expiresAt && Date.now() > new Date(meta.expiresAt).getTime()));

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground text-center max-w-md">{err}</p>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground text-center max-w-md">Tracking session ended</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-4">
        <h1 className="text-lg font-semibold">EloFix · Driver tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">{meta.destinationLabel}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Order status: <span className="font-medium text-foreground">{meta.fulfillmentStatus}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          This page only shows the latest shared location. It does not publish GPS from this device.
        </p>
      </header>
      <main className="p-4 max-w-lg mx-auto">
        <DeliveryMap
          lat={meta.lastLocation?.lat ?? null}
          lng={meta.lastLocation?.lng ?? null}
          destination={meta.destinationLabel}
          showWaitingBanner={!meta.lastLocation}
        />
      </main>
    </div>
  );
}
