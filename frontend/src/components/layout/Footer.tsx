import { Link } from 'react-router-dom';
import { EloFixLogo } from '@/components/EloFixLogo';
import { COMPANY, formatCopyright } from '@/lib/company';

const FOOTER_LINKS = {
  platform: [
    { to: '/#platform', label: 'Request Services' },
    { to: '/#platform', label: 'Order Materials' },
    { to: '/#how-it-works', label: 'How It Works' },
    { to: '/#suppliers', label: 'Suppliers' },
    { to: '/contact', label: 'Contact Us' },
  ],
  partners: [
    { to: '/register?role=provider', label: 'Become a Provider' },
    { to: '/#supplier-partnership', label: 'Supplier Partnership' },
    { to: '/login', label: 'Supplier Login' },
  ],
  legal: [
    { to: '/terms', label: 'Terms & Conditions' },
    { to: '/privacy', label: 'Privacy Policy' },
    { to: '/refund-policy', label: 'Refund, Returns & Cancellation Policy' },
    { to: '/delivery-policy', label: 'Delivery & Collection Policy' },
    { to: '/provider-agreement', label: 'Provider Agreement' },
    { to: '/supplier-agreement', label: 'Supplier Agreement' },
    { to: '/legal', label: 'All Legal Policies' },
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
              EloFix is a South African marketplace for maintenance services and building materials. Request
              independent providers or order from participating suppliers — with quotation-based service pricing in
              ZAR.
            </p>
            <p className="mt-4 max-w-xs text-sm font-medium text-primary-foreground/80">
              {COMPANY.operatorStatement}
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
                <li key={link.to}>
                  <Link to={link.to} className="transition-colors hover:text-primary-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-primary-foreground/10 pt-8 md:flex-row">
          <p className="text-center text-sm text-primary-foreground/60 md:text-left">{formatCopyright()}</p>
          <p className="text-xs text-primary-foreground/50">Secure payments · Flexible options · Real-time tracking</p>
        </div>
      </div>
    </footer>
  );
}
