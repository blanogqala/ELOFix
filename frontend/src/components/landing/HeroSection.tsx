import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingCart, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LANDING_STATS } from './landingData';

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section id="home" className="relative scroll-mt-20 overflow-hidden">
      <div className="landing-hero-bg absolute inset-0" aria-hidden />
      <div className="landing-hero-overlay absolute inset-0" aria-hidden />

      <div className="container relative z-10 py-16 md:py-24 lg:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="landing-fade-in landing-delay-1 mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-6xl xl:text-7xl">
            Your complete platform for{' '}
            <span className="bg-gradient-to-r from-accent via-amber-300 to-accent bg-clip-text text-transparent">
              home & business maintenance
            </span>
          </h1>

          <p className="landing-fade-in landing-delay-2 mx-auto mb-10 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg lg:text-xl">
            Request independent professionals, order hardware from participating suppliers, and track jobs and
            deliveries — from quote to fulfilment — with flexible payment options in South African Rand (ZAR).
          </p>

          <div className="landing-fade-in landing-delay-3 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button
              size="lg"
              className="btn-accent h-14 px-8 text-base shadow-lg shadow-accent/30"
              onClick={() => navigate('/user/request/service')}
            >
              <Wrench className="mr-2 h-5 w-5" />
              Request a Service
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 border-white/25 bg-accent/80 px-8 text-base text-white backdrop-blur-sm hover:bg-accent/50 hover:text-white"
              onClick={() => navigate('/user/order-materials')}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Order Materials
            </Button>
          </div>

          <div className="landing-fade-in landing-delay-4 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Independent providers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Payments in ZAR
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Live order tracking
            </span>
          </div>
        </div>

        <div className="landing-fade-in landing-delay-5 mx-auto mt-14 max-w-4xl rounded-2xl border border-white/10 bg-accent/90 p-1 backdrop-blur-md md:mt-20">
          <div className="grid grid-cols-2 divide-white/40 md:grid-cols-4 md:divide-x">
            {LANDING_STATS.map((stat) => (
              <div key={stat.label} className="px-4 py-5 text-center md:py-6">
                <div className="text-2xl font-bold text-white md:text-3xl">{stat.value}</div>
                <div className="mt-1 text-xs text-white/60 md:text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
