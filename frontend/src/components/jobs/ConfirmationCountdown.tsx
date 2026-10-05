import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { confirmationCountdownCopy } from '@/lib/completionPaymentDue';

interface ConfirmationCountdownProps {
  deadlineAt?: string | null;
  confirmationWindowExpired?: boolean;
  balanceOutstanding?: boolean;
  recoveryDueAt?: string | null;
  className?: string;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function formatLocalDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

export function ConfirmationCountdown({
  deadlineAt,
  confirmationWindowExpired = false,
  balanceOutstanding = false,
  recoveryDueAt,
  className,
}: ConfirmationCountdownProps) {
  const [remaining, setRemaining] = useState('');
  const expiredUnpaid = Boolean(confirmationWindowExpired && balanceOutstanding);
  const copy = confirmationCountdownCopy({ expiredUnpaid, balanceOutstanding });

  useEffect(() => {
    if (!deadlineAt || expiredUnpaid) return;
    const update = () => {
      const ms = new Date(deadlineAt).getTime() - Date.now();
      setRemaining(formatRemaining(ms));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [deadlineAt, expiredUnpaid]);

  if (!deadlineAt && !expiredUnpaid) return null;

  const recoveryLabel = formatLocalDate(recoveryDueAt);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3',
        className
      )}
    >
      <Clock className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden />
      <div>
        <p className="font-medium text-sm text-amber-900 dark:text-amber-100">{copy.title}</p>
        {expiredUnpaid ? (
          <p className="text-sm text-muted-foreground mt-1">
            {copy.detail}
            {recoveryLabel ? ` Recovery review date: ${recoveryLabel}.` : ''}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            {copy.detail}{' '}
            <span className="font-medium text-foreground">{remaining}</span>
          </p>
        )}
      </div>
    </div>
  );
}
