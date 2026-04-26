import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';
import { getAdminEscrowV2Breakdown } from '@/lib/adminJobFinancial';
import type { Job } from '@/types';
import { DollarSign } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  job: Job;
  title?: string;
  description?: string;
  footer?: ReactNode;
};

/**
 * Single admin payment summary: same layout for Job details and Payment details.
 * Uses API-backed totals; tranche lines partition releasedAmount only.
 */
export function AdminJobPaymentBreakdownCard({
  job,
  title = 'Payment breakdown',
  description = 'Labor settlement: what the customer paid, platform fee, your provider share, and releases.',
  footer,
}: Props) {
  const fin = getAdminEscrowV2Breakdown(job);
  const totalPaid =
    fin.totalPrice > 0
      ? fin.totalPrice
      : safeOrZero(job.servicePrice?.amount) || safeOrZero(job.totalEstimateRange?.min);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {title}
        </CardTitle>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-0 rounded-lg border border-primary bg-muted/20 p-4">
          <div className="flex items-center justify-between text-sm py-2">
            <span className="text-muted-foreground">Total paid by customer</span>
            <span className="font-semibold tabular-nums">{formatCurrency(fin.totalPrice || totalPaid)}</span>
          </div>
          <div className="flex items-center justify-between text-sm py-2">
            <span className="text-muted-foreground">Platform fee (7%)</span>
            <span className="tabular-nums">{formatCurrency(fin.commission)}</span>
          </div>
          <div className="border-b border-border pb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Provider earnings (93%)</span>
            <span className="font-medium tabular-nums">{formatCurrency(fin.provider)}</span>
          </div>

          <div className="h-px bg-border my-3" aria-hidden />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Releases (50% / 50%)</p>
          <div className="flex items-center justify-between text-sm py-2">
            <span className="text-muted-foreground">First release (50%)</span>
            <span className="tabular-nums">{formatCurrency(fin.firstRelease)}</span>
          </div>
          <div className="flex items-center justify-between text-sm py-2 border-b border-border pb-2">
            <span className="text-muted-foreground">Second release (50%)</span>
            <span className="tabular-nums">{formatCurrency(fin.secondRelease)}</span>
          </div>

          <div className="h-px bg-border my-3" aria-hidden />

          <div className="flex items-center justify-between text-sm py-2">
            <span className="text-muted-foreground">Total released to provider</span>
            <span className="font-medium text-primary tabular-nums">{formatCurrency(fin.released)}</span>
          </div>
          <div className="flex items-center justify-between text-sm py-2">
            <span className="text-muted-foreground">Remaining balance</span>
            <span className="font-medium tabular-nums">{formatCurrency(fin.remaining)}</span>
          </div>
        </div>
        {footer}
      </CardContent>
    </Card>
  );
}

function safeOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
