import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { settlementStatusBadgeClass, settlementStatusLabel } from '@/lib/payoutDisplay';

type Props = {
  status?: string | null;
  className?: string;
};

export function SettlementStatusBadge({ status, className }: Props) {
  return (
    <Badge className={cn('text-[10px] whitespace-normal text-center', settlementStatusBadgeClass(status), className)}>
      {settlementStatusLabel(status)}
    </Badge>
  );
}
