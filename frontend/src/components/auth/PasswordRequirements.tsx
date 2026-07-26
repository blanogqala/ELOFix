import { Circle } from 'lucide-react';
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
  if (!String(password ?? '').trim()) return null;

  const checks = getPasswordChecks(password);
  const unmet = PASSWORD_REQUIREMENT_LABELS.filter(({ key }) => !checks[key]);
  if (unmet.length === 0) return null;

  return (
    <ul className={cn('mt-2 space-y-1 text-xs text-muted-foreground', className)} aria-live="polite">
      {unmet.map(({ key, label }) => (
        <li key={key} className="flex items-center gap-1.5">
          <Circle className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
