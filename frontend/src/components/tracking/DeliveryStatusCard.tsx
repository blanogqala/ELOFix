import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Store, Link2 } from 'lucide-react';
import type { CanonicalDeliveryType } from '@/lib/deliveryTypes';
import { canonicalDeliveryLabel } from '@/lib/deliveryTypes';
import { fulfillmentStatusBadgeLabel } from '@/lib/materialBatchTracking';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export interface DeliveryStatusCardProps {
  canonicalType: CanonicalDeliveryType;
  fulfillmentStatus?: string;
  supplierName?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  /** Public path /track/:id when supplier started delivery */
  trackingId?: string | null;
  /** Optional access token for secured tracking URL */
  trackingToken?: string | null;
}

export function DeliveryStatusCard({
  canonicalType,
  fulfillmentStatus,
  supplierName,
  supplierPhone,
  supplierAddress,
  trackingId,
  trackingToken,
}: DeliveryStatusCardProps) {
  const { toast } = useToast();
  const origin =
    typeof window !== 'undefined' && trackingId
      ? `${window.location.origin}/track/${trackingId}${
          trackingToken && trackingToken.length > 0
            ? `?token=${encodeURIComponent(trackingToken)}`
            : ''
        }`
      : '';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-5 w-5 text-primary" />
          Supplier & delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{canonicalDeliveryLabel(canonicalType)}</Badge>
          {fulfillmentStatus ? (
            <Badge variant="secondary">{fulfillmentStatusBadgeLabel(fulfillmentStatus)}</Badge>
          ) : null}
        </div>
        {supplierName ? (
          <div>
            <p className="text-xs uppercase text-muted-foreground">Supplier</p>
            <p className="font-medium">{supplierName}</p>
            {supplierPhone ? <p className="text-muted-foreground">{supplierPhone}</p> : null}
            {supplierAddress ? <p className="text-muted-foreground">{supplierAddress}</p> : null}
          </div>
        ) : null}
        {trackingId && origin ? (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              Driver tracking link
            </p>
            <p className="text-xs text-muted-foreground break-all">{origin}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(origin);
                toast({ title: 'Copied', description: 'Tracking link copied to clipboard.' });
              }}
            >
              Copy link
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
