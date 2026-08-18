import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getPublicShowcaseSuppliers } from '@/lib/api/suppliers';
import {
  shouldMarquee,
  showcaseCardSlotWidth,
  visibleCardCapacity,
  type PublicShowcaseSupplier,
} from '@/lib/publicSupplierShowcase';
import { SUPPLIER_CAPABILITIES } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

const MARKETPLACE_EYEBROW = 'Materials marketplace';

const ONBOARDING_TITLE = 'Supplier onboarding underway';
const ONBOARDING_DESCRIPTION =
  'EloFix is building a network of participating hardware and materials suppliers. As suppliers join the platform, customers will be able to browse branch catalogues with prices in ZAR and choose collection or delivery options where available.';
const ONBOARDING_SUPPORT =
  'We’re currently onboarding hardware and materials suppliers. Approved partners will appear here as they join EloFix.';

const LIVE_TITLE = 'Approved hardware suppliers';
const LIVE_DESCRIPTION = 'Browse participating suppliers available through EloFix.';

function CapabilityCard({ item }: { item: (typeof SUPPLIER_CAPABILITIES)[number] }) {
  return (
    <div className="landing-card mx-3 flex w-[220px] shrink-0 flex-col rounded-2xl border-2 border-accent bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:w-[240px]">
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white shadow-md',
          item.color,
        )}
      >
        {item.initials}
      </div>
      <h3 className="mb-1 font-bold">{item.name}</h3>
      <p className="text-sm text-muted-foreground">{item.tagline}</p>
    </div>
  );
}

function SupplierLogo({ supplier }: { supplier: PublicShowcaseSupplier }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(supplier.logoUrl) && !failed;

  if (showImage) {
    return (
      <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/50 p-2 shadow-sm">
        <img
          src={supplier.logoUrl}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-sm font-bold tracking-wide text-white shadow-md">
      {supplier.initials}
    </div>
  );
}

function SupplierCard({ supplier }: { supplier: PublicShowcaseSupplier }) {
  return (
    <article className="landing-card mx-3 flex h-[196px] w-[220px] shrink-0 flex-col rounded-2xl border-2 border-accent bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:h-[208px] sm:w-[240px]">
      <SupplierLogo supplier={supplier} />
      <h3 className="line-clamp-2 font-bold leading-snug">{supplier.displayName}</h3>
      {supplier.tagline ? (
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{supplier.tagline}</p>
      ) : null}
      <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Approved partner</p>
      </div>
    </article>
  );
}

function CardSkeletons() {
  return (
    <div className="flex justify-center overflow-hidden py-2" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="mx-3 h-[196px] w-[220px] shrink-0 animate-pulse rounded-2xl border-2 border-accent/40 bg-muted sm:h-[208px] sm:w-[240px]"
        />
      ))}
    </div>
  );
}

function EdgeFades() {
  return (
    <>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-muted/30 to-transparent md:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-muted/30 to-transparent md:w-24" />
    </>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useVisibleCardCapacity() {
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const isSmallUp = window.matchMedia('(min-width: 640px)').matches;
      setCapacity(visibleCardCapacity(el.clientWidth, showcaseCardSlotWidth(isSmallUp)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return { ref, capacity };
}

export function SupplierShowcaseSection() {
  const doubledCapabilities = [...SUPPLIER_CAPABILITIES, ...SUPPLIER_CAPABILITIES];
  const [suppliers, setSuppliers] = useState<PublicShowcaseSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const reducedMotion = usePrefersReducedMotion();
  const { ref: cardRegionRef, capacity } = useVisibleCardCapacity();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const rows = await getPublicShowcaseSuppliers();
        if (!cancelled) setSuppliers(rows);
      } catch (error) {
        console.error('Failed to load public suppliers for landing showcase', error);
        if (!cancelled) setSuppliers([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const supplierCount = suppliers.length;
  const hasSuppliers = !isLoading && supplierCount > 0;
  const showCapabilities = !isLoading && supplierCount === 0;
  const overflow = shouldMarquee(supplierCount, capacity);
  const useCarousel = hasSuppliers && overflow && !reducedMotion;
  const useScrollRow = hasSuppliers && overflow && reducedMotion;
  const supplierItems = useCarousel ? [...suppliers, ...suppliers] : suppliers;

  return (
    <LandingSection id="suppliers" className="overflow-hidden border-y-2 border-accent/60 bg-primary/10">
      <SectionHeader
        eyebrow={MARKETPLACE_EYEBROW}
        title={hasSuppliers ? LIVE_TITLE : ONBOARDING_TITLE}
        description={hasSuppliers ? LIVE_DESCRIPTION : ONBOARDING_DESCRIPTION}
      />

      <div ref={cardRegionRef} className="relative">
        {isLoading ? (
          <CardSkeletons />
        ) : showCapabilities ? (
          <>
            <EdgeFades />
            <div className="landing-marquee flex w-max py-2">
              {doubledCapabilities.map((item, index) => (
                <CapabilityCard key={`${item.name}-${index}`} item={item} />
              ))}
            </div>
          </>
        ) : (
          <>
            {useCarousel ? <EdgeFades /> : null}
            {useCarousel ? (
              <div className="overflow-hidden">
                <div className="landing-marquee flex w-max py-2">
                  {supplierItems.map((supplier, index) => (
                    <SupplierCard key={`${supplier.id}-${index}`} supplier={supplier} />
                  ))}
                </div>
              </div>
            ) : useScrollRow ? (
              <div className="landing-showcase-scroll py-2">
                {supplierItems.map((supplier) => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
              </div>
            ) : (
              <div className="flex justify-center overflow-hidden py-2">
                {supplierItems.map((supplier) => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCapabilities ? (
        <p className="mt-6 text-center text-sm leading-relaxed text-muted-foreground md:text-base">
          {ONBOARDING_SUPPORT}
        </p>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Supplier catalogues and prices are those listed by participating branches. EloFix does not fabricate product
        prices on this page.
      </p>
    </LandingSection>
  );
}
