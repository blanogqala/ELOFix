import { cn } from '@/lib/utils';
import { SUPPLIER_BRANDS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

function SupplierCard({ brand }: { brand: (typeof SUPPLIER_BRANDS)[number] }) {
  return (
    <div className="landing-card mx-3 flex w-[220px] shrink-0 flex-col rounded-2xl border-2 border-accent bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md sm:w-[240px]">
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white shadow-md',
          brand.color,
        )}
      >
        {brand.initials}
      </div>
      <h3 className="mb-1 font-bold">{brand.name}</h3>
      <p className="text-sm text-muted-foreground">{brand.tagline}</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Approved partner
      </div>
    </div>
  );
}

export function SupplierShowcaseSection() {
  const doubled = [...SUPPLIER_BRANDS, ...SUPPLIER_BRANDS];

  return (
    <LandingSection id="suppliers" className="overflow-hidden border-y-2 border-accent/60 bg-primary/10">
      <SectionHeader
        eyebrow="Hardware partners"
        title="Approved hardware suppliers"
        description="Shop from nationally trusted retailers with integrated catalogs, branch-level inventory, and competitive pricing."
      />

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-muted/30 to-transparent md:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-muted/30 to-transparent md:w-24" />

        <div className="landing-marquee flex w-max py-2">
          {doubled.map((brand, index) => (
            <SupplierCard key={`${brand.name}-${index}`} brand={brand} />
          ))}
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        And more approved suppliers joining the EloFix ecosystem
      </p>
    </LandingSection>
  );
}
