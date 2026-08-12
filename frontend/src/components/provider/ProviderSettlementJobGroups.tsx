import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';
import { cn } from '@/lib/utils';
import {
  formatSettlementStageLabel,
  type SettlementJobGroup,
} from '@/lib/providerSettlementGroups';

type Props = {
  groups: SettlementJobGroup[];
  /** share = emphasize commission/share ledger; history = settlement history */
  variant?: 'history' | 'share';
  emptyMessage?: string;
};

function shortJobId(jobId: string): string {
  return jobId.length > 8 ? jobId.slice(0, 8) : jobId;
}

export function ProviderSettlementJobGroups({
  groups,
  variant = 'history',
  emptyMessage = 'No settlement records yet.',
}: Props) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const open = openIds[group.jobId] ?? false;
        return (
          <div key={group.jobId} className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setOpenIds((prev) => ({ ...prev, [group.jobId]: !open }))}
              aria-expanded={open}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <p className="font-medium truncate">{group.jobTitle}</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-[10px]',
                      group.settlementLabel === 'Fully settled' && 'bg-success/15 text-success'
                    )}
                  >
                    {group.settlementLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Job #{shortJobId(group.jobId)}
                  {group.customerName ? ` · ${group.customerName}` : ''}
                </p>
                <div className="grid grid-cols-2 gap-2 pl-6 pt-1 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer paid</p>
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(group.totalCustomerPaid, { decimals: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Provider share</p>
                    <p className="font-semibold tabular-nums text-primary">
                      {formatCurrency(group.totalProviderShare, { decimals: 2 })}
                    </p>
                  </div>
                  {variant === 'share' ? (
                    <div>
                      <p className="text-xs text-muted-foreground">EloFix commission</p>
                      <p className="font-medium tabular-nums">
                        {formatCurrency(group.totalCommission, { decimals: 2 })}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </button>

            {open ? (
              <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment breakdown
                </p>
                {group.stages.map((stage) => (
                  <div
                    key={stage.id}
                    className="rounded-md border border-border bg-background p-3 text-sm space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{formatSettlementStageLabel(stage.paymentType)}</p>
                      <Badge className="bg-success text-success-foreground text-[10px]">Settled</Badge>
                    </div>
                    <div className="flex justify-between gap-2 text-muted-foreground">
                      <span>Customer payment</span>
                      <span className="tabular-nums text-foreground">
                        {formatCurrency(stage.customerAmount, { decimals: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-muted-foreground">
                      <span>Provider share</span>
                      <span className="tabular-nums text-foreground font-medium">
                        {formatCurrency(stage.providerShare, { decimals: 2 })}
                      </span>
                    </div>
                    {variant === 'share' ? (
                      <div className="flex justify-between gap-2 text-muted-foreground">
                        <span>Commission</span>
                        <span className="tabular-nums">
                          {formatCurrency(stage.commissionAmount, { decimals: 2 })}
                        </span>
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground font-mono break-all pt-1">
                      {stage.merchantReference}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(stage.paidAt).toLocaleString()}
                    </p>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to={`/provider/jobs/${group.jobId}`}>View payment details</Link>
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
