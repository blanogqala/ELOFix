import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getPasswordChecks,
  PASSWORD_REQUIREMENT_LABELS,
} from '@/lib/accountValidation';

type PasswordRequirementsProps = {
  password: string;
  className?: string;
};

export function PasswordRequirements({ password, className }: PasswordRequirementsProps) {
  const checks = getPasswordChecks(password);

  return (
    <ul className={cn('mt-2 space-y-1 text-xs text-muted-foreground', className)} aria-live="polite">
      {PASSWORD_REQUIREMENT_LABELS.map(({ key, label }) => {
        const ok = checks[key];
        return (
          <li key={key} className={cn('flex items-center gap-1.5', ok && 'text-emerald-600')}>
            {ok ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
            )}
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
