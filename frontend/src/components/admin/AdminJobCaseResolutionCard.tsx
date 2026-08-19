import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { ExternalLink, AlertCircle, CheckCircle2, RotateCcw, Scale } from 'lucide-react';
import type { AdminJobCaseSummary } from '@/lib/api/adminDisputes';
import {
  getAdminCaseViewPath,
  getPayerBadgeKind,
  getPayerBadgeLabel,
} from '@/lib/adminJobCaseResolution';
import { formatDisputeStatus, formatAdminResolutionAction } from '@/lib/disputeLabels';

type Props = {
  summary: AdminJobCaseSummary;
};

function PayerIcon({ kind }: { kind: ReturnType<typeof getPayerBadgeKind> }) {
  if (kind === 'customer_owes') return <AlertCircle className="h-6 w-6 text-warning shrink-0 mt-0.5" />;
  if (kind === 'provider_owes') return <RotateCcw className="h-6 w-6 text-destructive shrink-0 mt-0.5" />;
  if (kind === 'resolved') return <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />;
  return <Scale className="h-6 w-6 text-muted-foreground shrink-0 mt-0.5" />;
}

function caseKindLabel(kind: string): string {
  return kind === 'cancellation' ? 'Cancellation' : 'Dispute';
}

function openedByLabel(openedBy: string | null | undefined, kind: string): string | null {
  if (kind !== 'cancellation' || !openedBy) return null;
  if (openedBy === 'customer') return 'Opened by customer';
  if (openedBy === 'provider') return 'Opened by provider';
  return null;
}

export function AdminJobCaseResolutionCard({ summary }: Props) {
  const navigate = useNavigate();
  const badgeKind = getPayerBadgeKind(summary);
  const badgeLabel = getPayerBadgeLabel(summary);
  const viewPath = getAdminCaseViewPath(summary);

  const containerClass = cn(
    'border rounded-xl p-5 space-y-4',
    badgeKind === 'customer_owes' && 'border-warning/50 bg-warning/5',
    badgeKind === 'provider_owes' && 'border-destructive/40 bg-destructive/5',
    badgeKind === 'resolved' && 'border-success/40 bg-success/5',
    badgeKind === 'neutral' && 'border-border bg-muted/30',
  );

  const openedByText = openedByLabel(summary.openedBy, summary.caseKind);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          <Scale className="h-4 w-4 shrink-0" />
          Case Resolution Summary
          <Badge variant="outline" className="ml-1 text-xs">
            {caseKindLabel(summary.caseKind)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {formatDisputeStatus(summary.status)}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Outcome block */}
        <div className={containerClass}>
          <div className="flex items-start gap-3">
            <PayerIcon kind={badgeKind} />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-sm">{badgeLabel}</p>
              <p className="text-sm text-foreground">{summary.payerSummary}</p>
              {summary.amountDue != null && summary.amountDue > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm mt-1">
                  <span>
                    Amount due:{' '}
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(summary.amountDue, { decimals: 2 })}
                    </span>
                  </span>
                  {summary.dueAt && (
                    <span className="text-muted-foreground">
                      Due by{' '}
                      {new Date(summary.dueAt).toLocaleDateString('en-ZA', { dateStyle: 'medium' })}
                    </span>
                  )}
                </div>
              )}
              {summary.refundToCustomer != null && summary.refundToCustomer > 0 && (
                <p className="text-sm">
                  Refund to customer:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(summary.refundToCustomer, { decimals: 2 })}
                  </span>
                </p>
              )}
              {summary.providerDebtAmount != null && summary.providerDebtAmount > 0 && (
                <p className="text-sm text-destructive">
                  Provider repayment owed:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(summary.providerDebtAmount, { decimals: 2 })}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Admin decision */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin decision</p>
          <p className="text-sm font-medium">{formatAdminResolutionAction(summary.action)}</p>
          {openedByText && (
            <p className="text-xs text-muted-foreground">{openedByText}</p>
          )}
          {summary.resolvedAt && (
            <p className="text-xs text-muted-foreground">
              Resolved {new Date(summary.resolvedAt).toLocaleString()}
            </p>
          )}
          {summary.notes && (
            <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground italic">
              {summary.notes}
            </blockquote>
          )}
        </div>

        {/* CTA */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => navigate(viewPath)}
        >
          <ExternalLink className="h-4 w-4" />
          View case &amp; conversation
        </Button>
      </CardContent>
    </Card>
  );
}
