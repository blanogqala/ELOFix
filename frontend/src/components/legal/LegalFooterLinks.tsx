import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/provider-agreement', label: 'Provider Agreement' },
  { to: '/refund-policy', label: 'Refund Policy' },
] as const;

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

  if (layout === 'stack') {
    return (
      <nav className={cn('flex flex-col gap-2 text-sm', className)} aria-label="Legal">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={linkClass}>
            {link.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm', className)}
      aria-label="Legal"
    >
      {LEGAL_LINKS.map((link, index) => (
        <span key={link.to} className="inline-flex items-center gap-3">
          {index > 0 && (
            <span
              className={cn(
                'hidden sm:inline',
                variant === 'inverse' ? 'text-primary-foreground/30' : 'text-border'
              )}
              aria-hidden
            >
              ·
            </span>
          )}
          <Link to={link.to} className={linkClass}>
            {link.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export { LEGAL_LINKS };
