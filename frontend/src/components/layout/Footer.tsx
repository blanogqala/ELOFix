import { Link } from 'react-router-dom';
import { EloFixLogo } from '@/components/EloFixLogo';

const FOOTER_LINKS = {
  platform: [
    { to: '/#platform', label: 'Request Services' },
    { to: '/#platform', label: 'Order Materials' },
    { to: '/#how-it-works', label: 'How It Works' },
    { to: '/#suppliers', label: 'Suppliers' },
  ],
  partners: [
    { to: '/register?role=provider', label: 'Become a Provider' },
    { to: '/#supplier-partnership', label: 'Supplier Partnership' },
    { to: '/login', label: 'Supplier Login' },
  ],
  legal: [
    { to: '/legal', label: 'All Legal Policies' },
    { to: '/privacy', label: 'Privacy Policy' },
    { to: '/terms', label: 'Terms of Service' },
    { to: '/provider-agreement', label: 'Provider Agreement' },
    { to: '/refund-policy', label: 'Refund Policy' },
  ],
};

export function Footer() {
  return (
    <footer className="mt-8 bg-primary text-primary-foreground">
      <div className="container py-12 md:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <EloFixLogo variant="light" className="mb-4 h-14" clickable={false} />
            <p className="max-w-xs text-sm leading-relaxed text-primary-foreground/70">
              South Africa&apos;s trusted marketplace for maintenance services, hardware materials, and supplier
              procurement — all in one platform.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground/90">
              Platform
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/70">
              {FOOTER_LINKS.platform.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="transition-colors hover:text-primary-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground/90">
              Partners
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/70">
              {FOOTER_LINKS.partners.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="transition-colors hover:text-primary-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground/90">
              Legal
            </h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/70">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="transition-colors hover:text-primary-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-primary-foreground/10 pt-8 md:flex-row">
          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} EloFix. All rights reserved.
          </p>
          <p className="text-xs text-primary-foreground/50">
            Secure payments · Flexible options · Real-time tracking
          </p>
        </div>
      </div>
    </footer>
  );
}
