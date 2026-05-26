import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PARTNERSHIP_BENEFITS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

export function SupplierPartnershipSection() {
  const navigate = useNavigate();

  return (
    <LandingSection id="supplier-partnership" className="bg-accent/20 backdrop-blur-sm">
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary via-primary to-[hsl(213,70%,22%)] text-primary-foreground shadow-xl">
        <div className="grid lg:grid-cols-2">
          <div className="p-8 md:p-12 lg:p-14">
            <SectionHeader
              eyebrow="For suppliers"
              title="Grow with EloFix supplier partnerships"
              description="Connect your branches to a nationwide customer base. Manage inventory, staff, orders, and earnings from one powerful dashboard."
              align="left"
              className="mb-8 [&_h2]:text-primary-foreground [&_p]:text-primary-foreground/75 [&_.text-accent]:text-accent"
            />

            <ul className="mb-8 space-y-3">
              {PARTNERSHIP_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-sm md:text-base">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <span className="text-primary-foreground/90">{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="btn-accent"
                onClick={() => navigate('/login')}
              >
                <Building2 className="mr-2 h-5 w-5" />
                Supplier Login
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                asChild
              >
                <a href="mailto:partnerships@elofix.com">
                  <Mail className="mr-2 h-5 w-5" />
                  Partner With Us
                </a>
              </Button>
            </div>
          </div>

          <div className="relative hidden items-center justify-center bg-white/5 p-8 lg:flex">
            <div className="landing-float grid max-w-sm grid-cols-2 gap-4">
              {['Orders', 'Branches', 'Inventory', 'Earnings'].map((label, i) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm"
                  style={{ animationDelay: `${i * 200}ms` }}
                >
                  <div className="mb-2 text-2xl font-bold text-accent">
                    {['2.4K', '48', '12K', 'R890K'][i]}
                  </div>
                  <div className="text-sm text-white/70">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </LandingSection>
  );
}

// export function ProviderCTASection() {
//   const navigate = useNavigate();

//   return (
//     <LandingSection reveal={false} className="py-12 md:py-16">
//       <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-accent/20 bg-accent/5 p-8 md:flex-row md:p-10">
//         <div className="text-center md:text-left">
//           <h3 className="text-2xl font-bold md:text-3xl">Are you a skilled professional?</h3>
//           <p className="mt-2 max-w-xl text-muted-foreground">
//             Join verified providers on EloFix. Get quality leads, secure escrow payments, and grow your business.
//           </p>
//         </div>
//         <Button
//           size="lg"
//           className="btn-accent shrink-0"
//           onClick={() => navigate('/register?role=provider')}
//         >
//           Become a Provider
//           <ArrowRight className="ml-2 h-5 w-5" />
//         </Button>
//       </div>
//     </LandingSection>
//   );
// }
