import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TESTIMONIALS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

export function TestimonialsSection() {
  if (TESTIMONIALS.length === 0) {
    return null;
  }

  return (
    <LandingSection id="testimonials" className="border-y border-border/60 bg-muted/20">
      <SectionHeader
        eyebrow="Customer stories"
        title="What customers say"
        description="Published only when EloFix has real, consented customer feedback to display."
      />

      <div className="grid gap-5 md:grid-cols-2 lg:gap-6">
        {TESTIMONIALS.map((testimonial, index) => (
          <article
            key={testimonial.name}
            className={cn(
              'landing-card flex flex-col rounded-2xl border border-border/70 bg-card p-6 transition-all duration-300 hover:shadow-lg md:p-8',
              index === 0 && 'md:col-span-2 lg:col-span-1',
            )}
          >
            <div className="mb-4 flex gap-0.5">
              {Array.from({ length: testimonial.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-accent text-accent" />
              ))}
            </div>
            <blockquote className="mb-6 flex-1 text-base leading-relaxed text-muted-foreground md:text-[15px]">
              &ldquo;{testimonial.quote}&rdquo;
            </blockquote>
            <div className="flex items-center gap-3 border-t border-border/60 pt-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {testimonial.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold">{testimonial.name}</p>
                <p className="text-xs text-muted-foreground">{testimonial.role}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </LandingSection>
  );
}
