import { Badge } from '@/components/ui/badge';
import { Award, BadgeCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Provider } from '@/types';
import { getProviderVerificationBadges } from '@/lib/providerReputation';

const variantStyles = {
  verified: 'border-success/40 bg-success/10 text-success',
  identity: 'border-primary/40 bg-primary/10 text-primary',
  profile: 'border-accent/50 bg-accent/20 text-foreground',
  new: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  bank: 'border-primary/30 bg-primary/5 text-primary',
  level: 'border-accent/40 bg-accent/15 text-foreground',
  trust: 'border-primary/40 bg-primary/10 text-primary',
} as const;

const variantIcons = {
  verified: ShieldCheck,
  identity: BadgeCheck,
  profile: Award,
  new: Sparkles,
  bank: ShieldCheck,
  level: Award,
  trust: ShieldCheck,
} as const;

interface ProviderVerificationBadgesProps {
  provider: Provider;
  className?: string;
  compact?: boolean;
}

export function ProviderVerificationBadges({
  provider,
  className,
  compact = false,
}: ProviderVerificationBadgesProps) {
  const badges = getProviderVerificationBadges(provider);
  if (badges.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {badges.map((b) => {
        const Icon = variantIcons[b.variant];
        return (
          <Badge
            key={b.id}
            variant="outline"
            className={cn('gap-1 font-normal', variantStyles[b.variant], compact && 'text-xs py-0')}
          >
            <Icon className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
            {b.label}
          </Badge>
        );
      })}
    </div>
  );
}
