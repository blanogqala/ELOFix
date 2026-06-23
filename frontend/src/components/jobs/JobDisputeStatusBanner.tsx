import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type JobDisputeStatusBannerProps =
  | {
      variant: 'admin';
      customerRequested?: string;
      customerComment?: string;
      disputeId?: string | null;
      onOpenDisputeCase?: () => void;
    }
  | {
      variant: 'provider';
      disputeId?: string | null;
      onViewDisputeCase?: () => void;
    };

export function JobDisputeStatusBanner(props: JobDisputeStatusBannerProps) {
  if (props.variant === 'admin') {
    const { customerRequested, customerComment, disputeId, onOpenDisputeCase } = props;
    return (
      <div className="card-elevated border-l-4 border-l-destructive p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-destructive">
                Dispatched — customer flagged work as not complete
              </p>
              <p className="text-sm text-muted-foreground">
                Payment is on hold until this case is investigated and resolved.
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
              Open dispute case
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { disputeId, onViewDisputeCase } = props;
  return (
    <div className="card-elevated border-l-4 border-l-destructive p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-destructive">Dispute opened</p>
            <p className="text-sm text-muted-foreground">
              A customer has disputed this job. Payment on hold until EloFix resolves the case.
            </p>
          </div>
        </div>
        {disputeId && onViewDisputeCase && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={onViewDisputeCase}>
            View dispute case
          </Button>
        )}
      </div>
    </div>
  );
}
