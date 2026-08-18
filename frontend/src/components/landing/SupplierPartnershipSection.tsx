import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COMPANY } from '@/lib/company';
import { PARTNERSHIP_BENEFITS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

const SUPPLIER_CAPABILITY_CARDS = [
  { title: 'Orders', label: 'Receive and fulfil material orders' },
  { title: 'Branches', label: 'Manage stock per location' },
  { title: 'Inventory', label: 'List products in ZAR' },
  { title: 'Fulfilment', label: 'Collection or delivery' },
];

export function SupplierPartnershipSection() {
  const navigate = useNavigate();

  return (
    <LandingSection id="supplier-partnership" className="bg-accent/20 backdrop-blur-sm">
      <div className="overflow-hidden rounded-3xl border border-white/10 text-primary-foreground shadow-2xl">
        <div className="grid lg:grid-cols-2">
          <div className="relative overflow-hidden p-8 md:p-12 lg:bg-gradient-to-br lg:from-primary lg:via-primary lg:to-[hsl(213,70%,22%)] lg:p-14">
            <div className="landing-supplier-bg absolute inset-0 lg:hidden" aria-hidden />
            <div className="landing-supplier-overlay--mobile absolute inset-0 lg:hidden" aria-hidden />
            <div className="landing-hero-grid absolute inset-0 opacity-[0.025] lg:hidden" aria-hidden />

            <div className="relative z-10">
              <SectionHeader
                eyebrow="For suppliers"
                title="Supply materials through EloFix"
                description="Join as a participating supplier to list branches, inventory, and fulfilment options for customers ordering building and hardware materials."
                align="left"
                className="mb-8 [&_h2]:text-primary-foreground [&_h2]:drop-shadow-md [&_p]:text-primary-foreground/90 [&_p]:drop-shadow-sm [&_.text-accent]:text-accent"
              />

              <ul className="mb-8 space-y-3">
                {PARTNERSHIP_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-sm md:text-base">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span className="text-primary-foreground/95 drop-shadow-sm">{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="btn-accent" onClick={() => navigate('/login')}>
                  <Building2 className="mr-2 h-5 w-5" />
                  Supplier Login
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  asChild
                >
                  <a href={`mailto:${COMPANY.partnershipsEmail}`}>
                    <Mail className="mr-2 h-5 w-5" />
                    Partner With Us
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="relative hidden min-h-[24rem] items-center justify-center overflow-hidden lg:flex">
            <div className="landing-supplier-bg absolute inset-0" aria-hidden />
            <div className="landing-supplier-overlay--desktop absolute inset-0" aria-hidden />
            <div className="landing-hero-grid absolute inset-0 opacity-[0.025]" aria-hidden />

            <div className="landing-float relative z-10 grid max-w-sm grid-cols-2 gap-4 p-8">
              {SUPPLIER_CAPABILITY_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className="rounded-2xl border-2 border-accent/50 bg-accent/30 p-5 backdrop-blur-sm"
                  style={{ animationDelay: `${i * 200}ms` }}
                >
                  <div className="mb-2 text-lg font-bold text-accent drop-shadow-sm">{card.title}</div>
                  <div className="text-sm text-white/80">{card.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}
