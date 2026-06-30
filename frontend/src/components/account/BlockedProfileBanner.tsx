import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BlockedProfileBannerProps {
  blockedReason?: string;
  supportHref: string;
  payBalanceHref?: string;
  showPayBalance?: boolean;
  className?: string;
}

export function BlockedProfileBanner({
  blockedReason,
  supportHref,
  payBalanceHref,
  showPayBalance,
  className = 'mb-4',
}: BlockedProfileBannerProps) {
  return (
    <div
      className={`${className} rounded-lg border border-destructive/40 bg-destructive/5 p-3`}
      role="alert"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">Profile blocked</p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {blockedReason?.trim() ||
                'Your account has been restricted. Contact support for more information.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <Link to={supportHref}>Contact support</Link>
          </Button>
          {showPayBalance && payBalanceHref ? (
            <Button asChild size="sm" variant="secondary" className="h-8 text-xs">
              <Link to={payBalanceHref}>Pay balance</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
