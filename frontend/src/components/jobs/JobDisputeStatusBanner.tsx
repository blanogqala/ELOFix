import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type JobDisputeStatusBannerProps =
  | {
      variant: 'admin';
      caseKind?: 'dispute' | 'cancellation';
      customerRequested?: string;
      customerComment?: string;
      disputeId?: string | null;
      onOpenDisputeCase?: () => void;
    }
  | {
      variant: 'provider';
      caseKind?: 'dispute' | 'cancellation';
      disputeId?: string | null;
      customerComment?: string;
      openedAt?: string | null;
      onViewDisputeCase?: () => void;
    };

export function JobDisputeStatusBanner(props: JobDisputeStatusBannerProps) {
  if (props.variant === 'admin') {
    const {
      customerRequested,
      customerComment,
      disputeId,
      onOpenDisputeCase,
      caseKind = 'dispute',
    } = props;
    return (
      <div className="card-elevated border-l-4 border-l-destructive p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-destructive">
                {caseKind === 'cancellation'
                  ? 'Cancellation opened — under review'
                  : 'Dispute requires investigation'}
              </p>
              <p className="text-sm text-muted-foreground">
                {caseKind === 'cancellation'
                  ? 'Payment is on hold until this cancellation is reviewed and resolved.'
                  : 'Customer rejected the provider’s completion claim. Payment is on hold until this case is investigated and resolved.'}
              </p>
              {(customerRequested || customerComment) && (
                <div className="mt-3 space-y-1 text-sm">
                  {customerRequested && (
                    <p>
                      <span className="text-muted-foreground">Customer requested:</span>{' '}
                      {customerRequested}
                    </p>
                  )}
                  {customerComment && (
                    <p className="text-muted-foreground">{customerComment}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          {disputeId && onOpenDisputeCase && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={onOpenDisputeCase}>
              Open case
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { disputeId, onViewDisputeCase, caseKind = 'dispute', customerComment, openedAt } = props;
  return (
    <div className="card-elevated border-l-4 border-l-destructive p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-destructive">
              {caseKind === 'cancellation' ? 'Cancellation opened' : 'Dispute opened'}
            </p>
            <p className="text-sm text-muted-foreground">
              {caseKind === 'cancellation'
                ? 'This job was cancelled and is under review. Payment on hold until EloFix resolves the case.'
                : 'Customer rejected completion — dispute under review. EloFix is reviewing the case. No refund has been issued automatically.'}
            </p>
            {openedAt ? (
              <p className="text-xs text-muted-foreground">
                Opened {new Date(openedAt).toLocaleString()}
              </p>
            ) : null}
            {customerComment ? (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Customer reason: </span>
                {customerComment}
              </p>
            ) : null}
          </div>
        </div>
        {disputeId && onViewDisputeCase && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onViewDisputeCase}>
            View case
          </Button>
        )}
      </div>
    </div>
  );
}
