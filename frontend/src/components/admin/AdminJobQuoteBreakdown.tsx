import { formatCurrency } from '@/lib/formatCurrency';
import { getAdminJobQuoteBreakdown } from '@/lib/adminJobFinancial';
import type { Job } from '@/types';
import { cn } from '@/lib/utils';

type Props = {
  job: Job;
  className?: string;
};

export function AdminJobQuoteBreakdown({ job, className }: Props) {
  const { labor, material, total, laborRefund, materialRefund, netTotal, hasRefunds } =
    getAdminJobQuoteBreakdown(job);

  if (labor <= 0 && material <= 0) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }

  return (
    <div className={cn('flex flex-col gap-0.5 leading-snug', className)}>
      <span>
        {formatCurrency(labor, { decimals: 2 })} + {formatCurrency(material, { decimals: 2 })} ={' '}
        {formatCurrency(total, { decimals: 2 })}
      </span>
      {laborRefund > 0 ? (
        <span className="text-[11px] text-destructive tabular-nums">
          −{formatCurrency(laborRefund, { decimals: 2 })} labor refunded
        </span>
      ) : null}
      {materialRefund > 0 ? (
        <span className="text-[11px] text-destructive tabular-nums">
          −{formatCurrency(materialRefund, { decimals: 2 })} material refunded
        </span>
      ) : null}
      {hasRefunds ? (
        <span className="text-[11px] font-semibold tabular-nums">
          Net {formatCurrency(netTotal, { decimals: 2 })}
        </span>
      ) : null}
    </div>
  );
}
