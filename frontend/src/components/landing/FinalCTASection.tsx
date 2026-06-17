import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingCart, UserPlus, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LandingSection } from './LandingSection';

export function FinalCTASection() {
  const navigate = useNavigate();

  return (
    <LandingSection reveal={false} className="pb-0 pt-8 md:pt-12 bg-accent/20 backdrop-blur-sm">
      <div className="relative min-h-[22rem] overflow-hidden rounded-3xl border border-white/10 px-6 py-14 text-center text-primary-foreground shadow-2xl md:min-h-[26rem] md:px-12 md:py-20">
        <div className="landing-cta-bg absolute inset-0" aria-hidden />
        <div className="landing-cta-overlay absolute inset-0" aria-hidden />
        <div className="landing-hero-grid absolute inset-0 opacity-[0.025]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight drop-shadow-md md:text-4xl lg:text-5xl">
            Ready to fix, build, or renovate?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-primary-foreground/95 drop-shadow-sm md:text-lg">
            Join thousands of satisfied customers and trusted partners. Your next project is just a few clicks away.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              size="lg"
              className="btn-accent border-accent border h-12 w-full"
              onClick={() => navigate('/user/request/service')}
            >
              <Wrench className="mr-2 h-4 w-4" />
              Request Service
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full border-accent/25 bg-accent/50 text-white hover:bg-accent/80 hover:text-white"
              onClick={() => navigate('/user/order-materials')}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Order Materials
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full border-accent/25 bg-accent/50 text-white hover:bg-accent/80 hover:text-white"
              onClick={() => navigate('/register?role=provider')}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Become Provider
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full border-accent/25 bg-accent/50 text-white hover:bg-accent/80 hover:text-white"
              asChild
            >
              <a href="#supplier-partnership">
                Supplier Partnership
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}
