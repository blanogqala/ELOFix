import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  getAdminEscrowV2Breakdown,
  getAdminJobCustomerRefundNet,
  getAdminJobLaborPaid,
  getAdminNetEscrowRemaining,
  getAdminNetPaidLaborProviderShare,
} from '@/lib/adminJobFinancial';
import { formatZar, paymentModeLabel } from '@/lib/paymentSchedule';
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
 * Legacy escrow-v2: 50% / 50% release schedule. Immediate-settlement: payment mode + schedule amounts.
 * Courier/delivery/mover: full hold until delivery confirmed.
 */
export function AdminJobPaymentBreakdownCard({
  job,
  title = 'Payment breakdown',
  description,
  footer,
}: Props) {
  const fin = getAdminEscrowV2Breakdown(job);
  const laborPaid = getAdminJobLaborPaid(job);
  const customerRefund = getAdminJobCustomerRefundNet(job);
  const netProviderShare = getAdminNetPaidLaborProviderShare(job);
  const netRemaining = getAdminNetEscrowRemaining(job);
  const isCancelledRefund = job.status === 'CANCELLED' && customerRefund > 0;
  const isLegacyEscrow = job.legacyEscrowV2 === true;
  const mode =
    job.paymentModeSnapshot ?? job.paymentSchedule?.paymentMode ?? null;
  const quoted =
    job.quotedAmount ??
    job.paymentSchedule?.quotedAmount ??
    job.servicePrice?.amount ??
    null;
  const firstAmt =
    job.firstPaymentAmount ?? job.paymentSchedule?.firstPaymentAmount ?? null;
  const secondAmt =
    job.secondPaymentAmount ?? job.paymentSchedule?.secondPaymentAmount ?? null;
  const progress =
    job.paymentProgress ?? job.paymentSchedule?.paymentProgress ?? 'NONE';
  const depositPaid =
    Boolean(job.depositPayment) || progress === 'FIRST_PAID' || progress === 'FULLY_PAID';
  const completionPaid = Boolean(job.completionPayment) || progress === 'FULLY_PAID';

  const totalPaid =
    fin.totalPrice > 0
      ? fin.totalPrice
      : laborPaid || safeOrZero(job.servicePrice?.amount) || safeOrZero(job.totalEstimateRange?.min);

  const resolvedDescription =
    description ??
    (isCancelledRefund && fin.isCourierEscrow
      ? 'Delivery cancelled — held customer funds were refunded (7% platform fee retained).'
      : fin.isCourierEscrow
        ? 'Delivery fee settlement: full provider share is held until the customer confirms delivery.'
        : isLegacyEscrow
          ? 'Legacy escrow labor settlement: customer paid, platform fee, provider share, and 50% / 50% releases.'
          : `Immediate settlement (${paymentModeLabel(mode)}): provider share is recorded per paid transaction.`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {title}
        </CardTitle>
        {resolvedDescription ? <p className="text-sm text-muted-foreground">{resolvedDescription}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-0 rounded-lg border border-primary bg-muted/20 p-4">
          {!fin.isCourierEscrow && !isLegacyEscrow ? (
            <>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Payment mode</span>
                <span className="font-medium">{paymentModeLabel(mode)}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Total quote</span>
                <span className="font-semibold tabular-nums">
                  {formatZar(quoted ?? totalPaid)}
                </span>
              </div>
              {mode === 'TWO_PAYMENT_50_50' ? (
                <>
                  <div className="flex items-center justify-between text-sm py-2">
                    <span className="text-muted-foreground">
                      Deposit (50%){depositPaid ? ' · Paid' : ''}
                    </span>
                    <span className="tabular-nums">{formatZar(firstAmt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b border-border pb-2">
                    <span className="text-muted-foreground">
                      Completion (50%){completionPaid ? ' · Paid' : ''}
                    </span>
                    <span className="tabular-nums">{formatZar(secondAmt)}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between text-sm py-2 border-b border-border pb-2">
                  <span className="text-muted-foreground">
                    {mode === 'SINGLE_PAYMENT_ON_COMPLETION'
                      ? 'Amount due on completion'
                      : 'Upfront amount'}
                    {progress === 'FULLY_PAID' || laborPaid ? ' · Paid' : ''}
                  </span>
                  <span className="tabular-nums">
                    {formatZar(firstAmt ?? quoted ?? totalPaid)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between text-sm py-2">
              <span className="text-muted-foreground">Total paid by customer</span>
              <span className="font-semibold tabular-nums">{formatCurrency(totalPaid)}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm py-2">
            <span className="text-muted-foreground">Platform fee (7%)</span>
            <span className="tabular-nums">{formatCurrency(fin.commission)}</span>
          </div>
          <div className="border-b border-border pb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Provider earnings (93%)</span>
            <span className="font-medium tabular-nums">{formatCurrency(netProviderShare)}</span>
          </div>

          <div className="h-px bg-border my-3" aria-hidden />

          {fin.isCourierEscrow ? (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Escrow (full hold until delivery confirmed)
              </p>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">
                  {isCancelledRefund ? 'Held funds (refunded to customer)' : 'Held until delivery confirmed'}
                </span>
                <span className="tabular-nums">{formatCurrency(isCancelledRefund ? 0 : fin.remaining)}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-2 border-b border-border pb-2">
                <span className="text-muted-foreground">Released after delivery confirmed</span>
                <span className="tabular-nums">{formatCurrency(fin.released)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                {isCancelledRefund
                  ? 'Customer held payment was returned on cancellation.'
                  : fin.deliveryConfirmed
                    ? 'Customer has confirmed delivery — provider funds may be released.'
                    : 'No funds are released until the customer confirms delivery.'}
              </p>
            </>
          ) : isLegacyEscrow ? (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Releases (50% / 50%) — legacy escrow
              </p>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">First release (50%)</span>
                <span className="tabular-nums">{formatCurrency(fin.firstRelease)}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-2 border-b border-border pb-2">
                <span className="text-muted-foreground">Second release (50%)</span>
                <span className="tabular-nums">{formatCurrency(fin.secondRelease)}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Total released to provider</span>
                <span className="font-medium text-primary tabular-nums">{formatCurrency(fin.released)}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Remaining balance</span>
                <span className="font-medium tabular-nums">{formatCurrency(netRemaining)}</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Settlement status
              </p>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Payment progress</span>
                <span className="font-medium">{String(progress).replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">Provider share recorded</span>
                <span className="font-medium text-primary tabular-nums">{formatCurrency(netProviderShare)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Manual escrow release applies only to legacy escrow jobs. New jobs settle per transaction.
              </p>
            </>
          )}

          {customerRefund > 0 && (
            <>
              <div className="h-px bg-border my-3" aria-hidden />
              <p className="text-xs font-medium text-destructive uppercase tracking-wide mb-2">
                {isCancelledRefund ? 'Cancellation refund' : 'Refund'}
              </p>
              <div className="flex items-center justify-between text-sm py-2">
                <span className="text-muted-foreground">
                  {fin.isCourierEscrow && isCancelledRefund
                    ? 'Held funds refunded to customer (net)'
                    : 'Customer refunded (net)'}
                </span>
                <span className="font-medium text-destructive tabular-nums">
                  −{formatCurrency(customerRefund)}
                </span>
              </div>
              {isLegacyEscrow && (job.refundDetails?.escrowApplied ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-muted-foreground">From escrow held</span>
                  <span className="tabular-nums">{formatCurrency(job.refundDetails.escrowApplied!)}</span>
                </div>
              )}
              {(job.refundDetails?.clawbackApplied ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-muted-foreground">Provider clawback</span>
                  <span className="tabular-nums">{formatCurrency(job.refundDetails!.clawbackApplied!)}</span>
                </div>
              )}
              {(job.refundDetails?.providerDebtAdded ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm py-2">
                  <span className="text-muted-foreground">Provider refund debt</span>
                  <span className="tabular-nums text-destructive">
                    {formatCurrency(job.refundDetails!.providerDebtAdded!)}
                  </span>
                </div>
              )}
            </>
          )}
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
