import { formatCurrency } from '@/lib/formatCurrency';
import { getAdminMaterialStoreBreakdown } from '@/lib/adminJobFinancial';
import type { Job } from '@/types';
import { cn } from '@/lib/utils';

type Props = {
  job: Job;
  supplierId: string;
  lineItemsTotal: number;
  className?: string;
  align?: 'start' | 'end';
};

function BreakdownColumn({
  label,
  amount,
  emphasized,
  destructive,
  align = 'end',
}: {
  label: string;
  amount: string;
  emphasized?: boolean;
  destructive?: boolean;
  align?: 'start' | 'end';
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', align === 'start' ? 'items-start' : 'items-end')}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          emphasized ? 'font-semibold' : 'font-medium',
          destructive && 'text-destructive',
        )}
      >
        {amount}
      </span>
    </div>
  );
}

export function AdminMaterialStoreBreakdown({
  job,
  supplierId,
  lineItemsTotal,
  className,
  align = 'start',
}: Props) {
  const { gross, commission, net, refund, cancelled } = getAdminMaterialStoreBreakdown(
    job,
    supplierId,
    lineItemsTotal,
  );

  if (gross <= 0) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;
  }

  if (cancelled && refund > 0) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-end gap-x-2 gap-y-1 text-xs',
          align === 'end' && 'justify-end',
          className,
        )}
      >
        <BreakdownColumn label="Material" amount={formatCurrency(gross, { decimals: 2 })} align={align} />
        <span className="pb-0.5 text-muted-foreground" aria-hidden>
          −
        </span>
        <BreakdownColumn
          label="Refund"
          amount={formatCurrency(refund, { decimals: 2 })}
          destructive
          align={align}
        />
        <span className="pb-0.5 text-muted-foreground" aria-hidden>
          =
        </span>
        <BreakdownColumn
          label="Net"
          amount={formatCurrency(net, { decimals: 2 })}
          emphasized
          align={align}
        />
        {commission > 0 ? (
          <p className="w-full text-[10px] text-muted-foreground">
            7% commission retained ({formatCurrency(commission, { decimals: 2 })})
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-x-2 gap-y-1 text-xs',
        align === 'end' && 'justify-end',
        className,
      )}
    >
      <BreakdownColumn label="Material" amount={formatCurrency(gross, { decimals: 2 })} align={align} />
      <span className="pb-0.5 text-muted-foreground" aria-hidden>
        −
      </span>
      <BreakdownColumn
        label="7% commission"
        amount={formatCurrency(commission, { decimals: 2 })}
        align={align}
      />
      <span className="pb-0.5 text-muted-foreground" aria-hidden>
        =
      </span>
      <BreakdownColumn
        label="Total"
        amount={formatCurrency(net, { decimals: 2 })}
        emphasized
        align={align}
      />
    </div>
  );
}
