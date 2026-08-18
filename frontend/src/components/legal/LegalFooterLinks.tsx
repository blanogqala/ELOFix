import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LegalFooterLinksProps {
  className?: string;
  variant?: 'default' | 'muted' | 'inverse';
  layout?: 'inline' | 'stack';
}

export function LegalFooterLinks({
  className,
  variant = 'default',
  layout = 'inline',
}: LegalFooterLinksProps) {
  const linkClass = cn(
    'transition-colors hover:underline',
    variant === 'inverse' && 'text-primary-foreground/70 hover:text-primary-foreground',
    variant === 'muted' && 'text-muted-foreground hover:text-foreground',
    variant === 'default' && 'text-muted-foreground hover:text-primary'
  );

  const links = (
    <>
      <Link to="/legal" className={linkClass}>
        All Legal Policies
      </Link>
      <Link to="/terms" className={linkClass}>
        Terms
      </Link>
      <Link to="/privacy" className={linkClass}>
        Privacy
      </Link>
      <Link to="/refund-policy" className={linkClass}>
        Refunds
      </Link>
    </>
  );

  if (layout === 'stack') {
    return (
      <nav className={cn('flex flex-col gap-2 text-sm', className)} aria-label="Legal">
        {links}
      </nav>
    );
  }

  return (
    <nav
      className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm', className)}
      aria-label="Legal"
    >
      <span className="inline-flex items-center gap-3">{links}</span>
    </nav>
  );
}

export const LEGAL_LINKS = [
  { to: '/legal', label: 'All Legal Policies' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund, Returns & Cancellation Policy' },
] as const;
