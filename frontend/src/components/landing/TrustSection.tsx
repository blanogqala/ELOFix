import { TRUST_ITEMS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

export function TrustSection() {
  return (
    <LandingSection id="why-choose-us" className="bg-accent/20 backdrop-blur-sm">
      <SectionHeader
        eyebrow="Trust & safety"
        title="What EloFix is built for"
        description="Verification, payments, tracking, and fulfilment tools designed for South African maintenance work."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="landing-card flex gap-4 rounded-2xl border-2 border-primary/70 bg-card p-5 transition-all duration-300 hover:border-accent/60 hover:shadow-md md:p-6"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </LandingSection>
  );
}
