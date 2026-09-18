import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import {
  feeIsKnown,
  settlementStatusDescription,
  type PayoutBreakdownAmounts,
} from '@/lib/payoutDisplay';
import { SettlementStatusBadge } from '@/components/payments/SettlementStatusBadge';

type Props = PayoutBreakdownAmounts & {
  recipientLabel?: string;
  className?: string;
  showExpectedBankSettlement?: boolean;
};

function Row({
  label,
  value,
  emphasize,
  negative,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground min-w-0 break-words">{label}</span>
      <span
        className={cn(
          'tabular-nums shrink-0 text-right',
          emphasize && 'font-semibold text-foreground',
          negative && 'text-muted-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PayoutBreakdown({
  customerAmount,
  commissionAmount,
  recipientGrossShare,
  processorFeeAmount,
  expectedBankSettlementAmount,
  payoutSettlementStatus,
  payoutSettledAt,
  recipientLabel = 'Your gross share',
  className,
  showExpectedBankSettlement = true,
}: Props) {
  const feeKnown = feeIsKnown(processorFeeAmount);
  const netKnown = feeIsKnown(expectedBankSettlementAmount);
  return (
    <div className={cn('space-y-1.5', className)}>
      <Row label="Customer payment" value={formatCurrency(customerAmount, { decimals: 2 })} />
      <Row
        label="EloFix commission (7%)"
        value={`-${formatCurrency(commissionAmount, { decimals: 2 })}`}
        negative
      />
      <Row
        label={recipientLabel}
        value={formatCurrency(recipientGrossShare, { decimals: 2 })}
        emphasize
      />
      <Row
        label="Paystack processing fee"
        value={
          feeKnown
            ? `-${formatCurrency(Number(processorFeeAmount), { decimals: 2 })}`
            : 'Pending confirmation'
        }
        negative={feeKnown}
      />
      {showExpectedBankSettlement ? (
        <Row
          label="Expected bank settlement"
          value={netKnown ? formatCurrency(Number(expectedBankSettlementAmount), { decimals: 2 }) : 'Pending confirmation'}
          emphasize={netKnown}
        />
      ) : null}
      {!feeKnown ? (
        <p className="text-xs text-muted-foreground">
          Paystack fee will be confirmed during settlement.
        </p>
      ) : null}
      {payoutSettlementStatus ? (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs text-muted-foreground">Payout status</span>
          <SettlementStatusBadge status={payoutSettlementStatus} />
        </div>
      ) : null}
      {payoutSettlementStatus ? (
        <p className="text-xs text-muted-foreground">
          {settlementStatusDescription(payoutSettlementStatus, payoutSettledAt)}
        </p>
      ) : null}
    </div>
  );
}
