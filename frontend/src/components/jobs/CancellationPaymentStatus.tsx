import { CheckCircle2, Circle } from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';
import type { CustomerCancelPreview } from '@/lib/jobCancellationPolicy';
import { cn } from '@/lib/utils';

type Props = {
  preview: CustomerCancelPreview;
  actor?: 'customer' | 'provider';
  hasMaterialsPaid: boolean;
  materialsAmount: number;
};

function MoneyRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-3 text-sm', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums shrink-0">{value}</span>
    </div>
  );
}

function TrancheRow({
  label,
  amount,
  status,
}: {
  label: string;
  amount: number;
  status: 'PAID' | 'UNPAID';
}) {
  const paid = status === 'PAID';
  return (
    <div className="flex items-start gap-2 text-sm">
      {paid ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium', paid ? 'text-foreground' : 'text-muted-foreground')}>{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(amount, { decimals: 2 })}
          {paid ? ' · Paid' : ' · Not paid'}
          {!paid ? ' · Not charged' : ''}
        </p>
      </div>
    </div>
  );
}

export function CancellationPaymentStatus({ preview, actor = 'customer', hasMaterialsPaid, materialsAmount }: Props) {
  const servicePrice = preview.servicePrice ?? 0;
  const paidToDate = preview.paidToDate ?? preview.laborGross ?? 0;
  const unpaidRemaining = preview.unpaidRemaining ?? 0;
  const amountUnderReview = preview.amountUnderReview ?? preview.laborRefund ?? 0;
  const showPaymentStatus = paidToDate > 0 || servicePrice > 0;
  const showStages = Boolean(preview.depositStage || preview.completionStage);
  const materialsRefund =
    preview.materialsRefundable && !hasMaterialsPaid ? materialsAmount : 0;

  if (!showPaymentStatus && !preview.opensDisputeReview && materialsRefund <= 0 && !hasMaterialsPaid) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showPaymentStatus ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment status</p>
          <div className="space-y-1.5">
            <MoneyRow label="Service price" value={formatCurrency(servicePrice, { decimals: 2 })} />
            <MoneyRow label="Paid to date" value={formatCurrency(paidToDate, { decimals: 2 })} />
            <MoneyRow label="Remaining unpaid" value={formatCurrency(unpaidRemaining, { decimals: 2 })} />
          </div>
          {showStages ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment progress
              </p>
              {preview.depositStage ? (
                <TrancheRow
                  label={preview.depositStage.label}
                  amount={preview.depositStage.amount}
                  status={preview.depositStage.status}
                />
              ) : null}
              {preview.completionStage ? (
                <TrancheRow
                  label={preview.completionStage.label}
                  amount={preview.completionStage.amount}
                  status={preview.completionStage.status}
                />
              ) : null}
              <MoneyRow
                label="Total paid"
                value={`${formatCurrency(paidToDate, { decimals: 2 })} / ${formatCurrency(servicePrice, { decimals: 2 })}`}
                className="pt-1 border-t border-border"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {preview.opensDisputeReview && paidToDate > 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cancellation review
          </p>
          <p className="text-sm text-muted-foreground">
            {unpaidRemaining > 0
              ? actor === 'provider'
                ? `Only the ${formatCurrency(amountUnderReview, { decimals: 2 })} already paid is subject to refund review. The unpaid ${formatCurrency(unpaidRemaining, { decimals: 2 })} completion payment has not been charged and is excluded.`
                : `Only the ${formatCurrency(amountUnderReview, { decimals: 2 })} you have already paid is subject to refund/dispute review. The unpaid ${formatCurrency(unpaidRemaining, { decimals: 2 })} completion payment has not been charged and is excluded from the refund calculation.`
              : `The full ${formatCurrency(amountUnderReview, { decimals: 2 })} paid is subject to refund review.`}
          </p>
          <MoneyRow
            label="Amount under review"
            value={formatCurrency(amountUnderReview, { decimals: 2 })}
            className="font-semibold"
          />
          {(preview.commissionOnPaid ?? 0) > 0 || (preview.providerShareOnPaid ?? 0) > 0 ? (
            <div className="space-y-1 border-t border-border pt-2 text-sm">
              <p className="text-xs text-muted-foreground">Recorded on paid amount</p>
              {(preview.commissionOnPaid ?? 0) > 0 ? (
                <MoneyRow
                  label="Platform commission"
                  value={formatCurrency(preview.commissionOnPaid!, { decimals: 2 })}
                />
              ) : null}
              {(preview.providerShareOnPaid ?? 0) > 0 ? (
                <MoneyRow
                  label="Provider share recorded"
                  value={formatCurrency(preview.providerShareOnPaid!, { decimals: 2 })}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {(materialsRefund > 0 || hasMaterialsPaid) && !preview.customerForfeits ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Materials</p>
          {materialsRefund > 0 ? (
            <MoneyRow
              label="Materials (not ordered)"
              value={`+${formatCurrency(materialsRefund, { decimals: 2 })}`}
            />
          ) : null}
          {hasMaterialsPaid ? (
            <p className="text-destructive text-sm">Materials already ordered — non-refundable</p>
          ) : null}
        </div>
      ) : null}

      {!preview.opensDisputeReview && preview.refundAmount > 0 && !preview.customerForfeits ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex justify-between gap-3 font-medium text-sm">
            <span>Total refund</span>
            <span className="text-success tabular-nums shrink-0">
              {formatCurrency(preview.refundAmount, { decimals: 2 })}
            </span>
          </div>
        </div>
      ) : null}

      {preview.opensDisputeReview && amountUnderReview > 0 ? (
        <p className="text-xs text-muted-foreground">
          Final refund amount is subject to admin review. Funds are held until the investigation is complete.
        </p>
      ) : null}
    </div>
  );
}
