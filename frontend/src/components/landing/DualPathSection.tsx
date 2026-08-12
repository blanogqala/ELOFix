import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingCart, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LandingSection, SectionHeader } from './LandingSection';

export function DualPathSection() {
  const navigate = useNavigate();

  return (
    <LandingSection id="platform" className="bg-accent/20 backdrop-blur-sm">
      <SectionHeader
        eyebrow="Two ways to get things done"
        title="Services or materials — your choice"
        description="Whether you need a skilled professional or building supplies from trusted hardware stores, EloFix connects you in minutes."
      />

      <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
        <article className="landing-card group relative overflow-hidden rounded-2xl border-2 border-border/80 bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg md:p-10">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-110" />
          <div className="relative">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Wrench className="h-7 w-7" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">Request Services</h3>
            <p className="mb-6 text-muted-foreground">
              Post a job, get AI-assisted estimates, compare verified providers by ratings and portfolios, and pay
              with flexible options — including staged payments on selected services.
            </p>
            <ul className="mb-8 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Plumbing, electrical, tiling & more
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Materials bundled with your job
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Flexible payment options by category
              </li>
            </ul>
            <Button className="btn-accent group/btn" onClick={() => navigate('/user/request/service')}>
              Request a Service
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
            </Button>
          </div>
        </article>

        <article className="landing-card group relative overflow-hidden rounded-2xl border-2 border-border/80 bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg md:p-10">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/5 transition-transform duration-500 group-hover:scale-110" />
          <div className="relative">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              <ShoppingCart className="h-7 w-7" />
            </div>
            <h3 className="mb-3 text-2xl font-bold">Order Materials</h3>
            <p className="mb-6 text-muted-foreground">
              Browse approved supplier catalogs, pick your nearest branch, and checkout for delivery or collection —
              no service provider required.
            </p>
            <ul className="mb-8 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Builders, BUCO, Cashbuild & more
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Branch-level stock & pricing
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Delivery or in-store pickup
              </li>
            </ul>
            <Button
              variant="outline"
              className="border-accent/40 text-accent bg-accent/10 hover:bg-accent hover:text-accent-foreground"
              onClick={() => navigate('/user/order-materials')}
            >
              Order Materials
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </article>
      </div>
    </LandingSection>
  );
}
