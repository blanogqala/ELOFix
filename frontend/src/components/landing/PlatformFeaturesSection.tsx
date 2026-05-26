import { cn } from '@/lib/utils';
import { PLATFORM_FEATURES } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

const accentStyles = {
  primary: {
    icon: 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground',
    dot: 'bg-primary',
  },
  accent: {
    icon: 'bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground',
    dot: 'bg-accent',
  },
  success: {
    icon: 'bg-success/10 text-success group-hover:bg-success group-hover:text-success-foreground',
    dot: 'bg-success',
  },
};

export function PlatformFeaturesSection() {
  return (
    <LandingSection id="features" className="border-y-2 border-accent/60 bg-primary/10">
      <SectionHeader
        eyebrow="Built for everyone"
        title="Everything you need in one ecosystem"
        description="Customers, providers, suppliers, and branch teams — all connected through a single trusted platform."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {PLATFORM_FEATURES.map((feature) => {
          const Icon = feature.icon;
          const styles = accentStyles[feature.accent];

          return (
            <article
              key={feature.id}
              id={feature.id}
              className="landing-card group rounded-2xl border-2 border-accent bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg md:p-8"
            >
              <div
                className={cn(
                  'mb-5 flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-300',
                  styles.icon,
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-bold md:text-xl">{feature.title}</h3>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              <ul className="space-y-2">
                {feature.highlights.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </LandingSection>
  );
}
