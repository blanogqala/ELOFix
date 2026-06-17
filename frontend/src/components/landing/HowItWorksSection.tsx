import howItWorksStep1 from '@/assets/how-it-works-step-1.png';
import howItWorksStep2 from '@/assets/how-it-works-step-2.png';
import howItWorksStep3 from '@/assets/how-it-works-step-3.png';
import { cn } from '@/lib/utils';
import { HOW_IT_WORKS_STEPS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

const STEP_IMAGES: Record<number, { src: string; alt: string }> = {
  1: {
    src: howItWorksStep1,
    alt: 'Create a service request in the EloFix app with photos, measurements, and location',
  },
  2: {
    src: howItWorksStep2,
    alt: 'Compare quotes, supplier branches, and delivery options before confirming your choice',
  },
  3: {
    src: howItWorksStep3,
    alt: 'Pay securely with escrow protection until work is completed and approved',
  },
};

export function HowItWorksSection() {
  return (
    <LandingSection id="how-it-works" className="bg-primary/10 border-y-2 border-accent/60">
      <SectionHeader
        eyebrow="Simple process"
        title="How EloFix works"
        description="From describing your need to secure payment — three straightforward steps for services and material orders."
      />

      <div className="relative mx-auto max-w-5xl">
        <div className="absolute left-8 top-8 hidden h-[calc(100%-4rem)] w-px bg-gradient-to-b from-primary/40 via-accent/40 to-success/40 md:block lg:left-1/2 lg:-translate-x-px" />

        <div className="space-y-8 md:space-y-12">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const isEven = index % 2 === 1;

            return (
              <div
                key={step.step}
                className={cn(
                  'relative grid items-center gap-6 md:grid-cols-2 md:gap-12',
                  isEven && 'md:[&>*:first-child]:order-2',
                )}
              >
                <div className={cn('md:text-left text-center', isEven ? 'md:text-right text-center' : '')}>
                  <div
                    className={cn(
                      'inline-flex items-center gap-3',
                      isEven ? 'md:flex-row-reverse' : '',
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground shadow-md shadow-accent/30">
                      {step.step}
                    </span>
                    <h3 className="text-xl font-bold md:text-2xl">{step.title}</h3>
                  </div>
                  <p className="mt-3 text-muted-foreground md:mt-4">{step.description}</p>
                </div>

                <div className={cn('flex', isEven ? 'md:justify-center justify-center' : 'md:justify-center justify-center')}>
                  <div className="landing-card flex w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl border-2 border-accent bg-gradient-to-br from-card to-muted/40 shadow-sm">
                    <img
                      src={STEP_IMAGES[step.step].src}
                      alt={STEP_IMAGES[step.step].alt}
                      className="h-auto w-full object-cover"
                    />
                  </div>
                </div>

                <div className="absolute left-8 top-1/2 hidden h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background bg-accent md:block lg:left-1/2" />
              </div>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
