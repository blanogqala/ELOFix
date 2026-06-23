import { Badge } from '@/components/ui/badge';
import type { FraudAlertStatus, FraudSeverity } from '@/lib/api/adminFraud';
import { cn } from '@/lib/utils';

const severityStyles: Record<FraudSeverity, string> = {
  LOW: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  MEDIUM: 'border-accent/50 bg-accent/20 text-foreground',
  HIGH: 'border-destructive/40 bg-destructive/10 text-destructive',
  CRITICAL: 'border-destructive bg-destructive text-destructive-foreground',
};

const statusStyles: Record<FraudAlertStatus, string> = {
  OPEN: 'border-destructive/40 bg-destructive/10 text-destructive',
  UNDER_REVIEW: 'border-accent/50 bg-accent/20 text-foreground',
  RESOLVED: 'border-success/40 bg-success/10 text-success',
  DISMISSED: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

export function FraudAlertBadge({
  severity,
  status,
  className,
}: {
  severity?: FraudSeverity;
  status?: FraudAlertStatus;
  className?: string;
}) {
  if (status) {
    return (
      <Badge variant="outline" className={cn('font-normal', statusStyles[status], className)}>
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  }
  if (severity) {
    return (
      <Badge variant="outline" className={cn('font-normal', severityStyles[severity], className)}>
        {severity}
      </Badge>
    );
  }
  return null;
}

export function formatAlertType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
