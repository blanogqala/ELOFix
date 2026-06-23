import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FraudStatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  onClick?: () => void;
  className?: string;
}

export function FraudStatCard({ title, value, icon: Icon, onClick, className }: FraudStatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card-elevated p-5 text-left w-full transition-opacity hover:opacity-95',
        onClick && 'cursor-pointer',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tabular-nums mt-1">{value.toLocaleString()}</p>
        </div>
        <div className="rounded-full bg-primary/10 p-2.5 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </button>
  );
}
