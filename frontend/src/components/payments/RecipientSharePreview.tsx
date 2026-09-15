import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import { feeIsKnown } from '@/lib/payoutDisplay';
import { recipientGrossSharePreview } from '@/lib/recipientGrossSharePreview';

type Props = {
  customerAmount: number;
  customerLabel?: string;
  grossShareLabel?: string;
  processorFeeAmount?: number | null;
  expectedBankSettlementAmount?: number | null;
  pendingFeeLabel?: string;
  pendingSettlementLabel?: string;
  className?: string;
  stages?: Array<{ title: string; customerAmount: number }>;
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

function ShareRows({
  customerAmount,
  customerLabel,
  grossShareLabel,
  processorFeeAmount,
  expectedBankSettlementAmount,
  pendingFeeLabel,
  pendingSettlementLabel,
}: Omit<Props, 'className' | 'stages'>) {
  const preview = recipientGrossSharePreview(customerAmount);
  const feeKnown = feeIsKnown(processorFeeAmount);
  const netKnown = feeIsKnown(expectedBankSettlementAmount);
  return (
    <>
      <Row label={customerLabel || 'Customer price'} value={formatCurrency(preview.customerPrice, { decimals: 2 })} />
      <Row
        label="EloFix commission (7%)"
        value={`-${formatCurrency(preview.commission, { decimals: 2 })}`}
        negative
      />
      <Row
        label={grossShareLabel || 'Your gross share (93%)'}
        value={formatCurrency(preview.grossShare, { decimals: 2 })}
        emphasize
      />
      <Row
        label="Paystack processing fee"
        value={
          feeKnown
            ? `-${formatCurrency(Number(processorFeeAmount), { decimals: 2 })}`
            : pendingFeeLabel || 'Pending confirmation'
        }
        negative={feeKnown}
      />
      <Row
        label="Expected bank settlement"
        value={
          netKnown
            ? formatCurrency(Number(expectedBankSettlementAmount), { decimals: 2 })
            : pendingSettlementLabel || 'Pending confirmation'
        }
        emphasize={netKnown}
      />
    </>
  );
}

export function RecipientSharePreview({
  customerAmount,
  customerLabel = 'Customer price',
  grossShareLabel = 'Your gross share (93%)',
  processorFeeAmount,
  expectedBankSettlementAmount,
  pendingFeeLabel = 'Confirmed after payment',
  pendingSettlementLabel = 'Confirmed after payment',
  className,
  stages,
}: Props) {
  if (!(Number(customerAmount) > 0) && !stages?.some((s) => Number(s.customerAmount) > 0)) {
    return null;
  }

  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      {stages && stages.length > 0 ? (
        <>
          <Row
            label="Total service quote"
            value={formatCurrency(recipientGrossSharePreview(customerAmount).customerPrice, { decimals: 2 })}
            emphasize
          />
          {stages.map((stage) => (
            <div key={stage.title} className="space-y-1 pt-2 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stage.title}</p>
              <ShareRows
                customerAmount={stage.customerAmount}
                customerLabel="Customer payment"
                grossShareLabel={grossShareLabel}
                pendingFeeLabel={pendingFeeLabel}
                pendingSettlementLabel={pendingSettlementLabel}
              />
            </div>
          ))}
        </>
      ) : (
        <ShareRows
          customerAmount={customerAmount}
          customerLabel={customerLabel}
          grossShareLabel={grossShareLabel}
          processorFeeAmount={processorFeeAmount}
          expectedBankSettlementAmount={expectedBankSettlementAmount}
          pendingFeeLabel={pendingFeeLabel}
          pendingSettlementLabel={pendingSettlementLabel}
        />
      )}
      {!feeIsKnown(processorFeeAmount) ? (
        <p className="text-xs text-muted-foreground break-words">
          Paystack processing fee is confirmed after payment and may reduce the final amount credited to your bank.
        </p>
      ) : null}
    </div>
  );
}
