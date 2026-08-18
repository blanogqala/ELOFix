import { Building2, ExternalLink, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { LandingSection } from '@/components/landing/LandingSection';
import {
  COMPANY,
  formatRegisteredAddress,
  formatRegistrationNumber,
} from '@/lib/company';

const CONTACT_CARDS = [
  {
    id: 'email',
    icon: Mail,
    title: 'General / legal contact',
    accent: 'primary' as const,
    content: (
      <a href={`mailto:${COMPANY.email}`} className="text-lg font-semibold text-primary hover:underline">
        {COMPANY.email}
      </a>
    ),
    action: (
      <Button className="btn-accent mt-4" asChild>
        <a href={`mailto:${COMPANY.email}`}>
          <Mail className="mr-2 h-4 w-4" />
          Email us
        </a>
      </Button>
    ),
  },
  {
    id: 'phone',
    icon: Phone,
    title: 'Telephone',
    accent: 'accent' as const,
    content: (
      <a href={COMPANY.phoneHref} className="text-lg font-semibold text-primary hover:underline">
        {COMPANY.phone}
      </a>
    ),
    action: (
      <Button variant="outline" className="mt-4 border-primary/30 hover:bg-primary/5" asChild>
        <a href={COMPANY.phoneHref}>
          <Phone className="mr-2 h-4 w-4" />
          Call us
        </a>
      </Button>
    ),
  },
  {
    id: 'website',
    icon: Globe,
    title: 'Website',
    accent: 'primary' as const,
    content: (
      <a
        href={COMPANY.website}
        className="inline-flex items-center gap-1.5 text-lg font-semibold text-primary hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {COMPANY.websiteDisplay}
        <ExternalLink className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </a>
    ),
  },
  {
    id: 'address',
    icon: MapPin,
    title: 'Registered / physical business address',
    accent: 'accent' as const,
    content: <p className="text-base leading-relaxed text-muted-foreground">{formatRegisteredAddress()}</p>,
  },
  {
    id: 'registration',
    icon: Building2,
    title: 'Company registration number',
    accent: 'primary' as const,
    content: <p className="text-lg font-semibold text-foreground">{formatRegistrationNumber()}</p>,
  },
  {
    id: 'country',
    icon: MapPin,
    title: 'Country of domicile',
    accent: 'accent' as const,
    content: <p className="text-lg font-semibold text-foreground">{COMPANY.country}</p>,
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <section className="relative scroll-mt-20 overflow-hidden">
          <div className="landing-hero-bg absolute inset-0" aria-hidden />
          <div className="landing-hero-overlay absolute inset-0" aria-hidden />

          <div className="container relative z-10 py-14 md:py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="landing-fade-in landing-delay-1 mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Get in touch
              </p>
              <h1 className="landing-fade-in landing-delay-2 mb-5 text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
                Contact{' '}
                <span className="bg-gradient-to-r from-accent via-amber-300 to-accent bg-clip-text text-transparent">
                  EloFix
                </span>
              </h1>
              <p className="landing-fade-in landing-delay-3 mx-auto max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
                {COMPANY.operatorStatement} For general and legal enquiries, reach our team using the details below.
              </p>
            </div>
          </div>
        </section>

        <LandingSection className="bg-accent/20 backdrop-blur-sm" reveal={false}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {CONTACT_CARDS.map((card) => {
              const Icon = card.icon;
              const iconWrapClass =
                card.accent === 'accent'
                  ? 'bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground'
                  : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground';

              return (
                <article
                  key={card.id}
                  className="landing-card group relative overflow-hidden rounded-2xl border-2 border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg md:p-8"
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-110" />
                  <div className="relative">
                    <div
                      className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${iconWrapClass}`}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {card.title}
                    </h2>
                    <div>{card.content}</div>
                    {card.action}
                  </div>
                </article>
              );
            })}
          </div>
        </LandingSection>

        <LandingSection className="border-y border-accent/40 bg-primary/5" reveal={false}>
          <div className="mx-auto max-w-3xl rounded-2xl border border-primary/15 bg-card px-6 py-10 text-center shadow-sm md:px-12 md:py-12">
            <p className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{COMPANY.brandName}</p>
            <p className="mt-2 text-base text-muted-foreground md:text-lg">
              Operated by {COMPANY.legalName}
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              EloFix is the marketplace brand. {COMPANY.legalName} is the legal operator for platform agreements,
              privacy, and business correspondence.
            </p>
          </div>
        </LandingSection>
      </main>

      <Footer />
    </div>
  );
}
