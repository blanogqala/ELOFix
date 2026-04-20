import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Wrench, ShoppingCart, ArrowRight } from 'lucide-react';

export default function NewRequest() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl animate-fade-in py-6 sm:py-8">
        <div className="mb-8 text-center sm:mb-10">
          <h1 className="mb-2 text-xl font-semibold sm:text-2xl md:text-3xl">What would you like to do?</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Choose an option below to get started</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {/* Request a Service */}
          <div
            onClick={() => navigate('/user/request/service')}
            className="card-elevated group cursor-pointer p-6 transition-all hover:border-primary/40 sm:p-8"
          >
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/20 sm:h-16 sm:w-16">
              <Wrench className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
            </div>
            <h2 className="mb-2 text-lg font-semibold sm:text-xl">Request a Service</h2>
            <p className="mb-6 text-sm text-muted-foreground sm:text-base">
              Hire a verified professional for plumbing, tiling, construction, moving, and more.
            </p>
            <div className="flex items-center gap-2 text-primary font-medium text-sm group-hover:gap-3 transition-all">
              Continue
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>

          {/* Order Materials */}
          <div
            onClick={() => navigate('/user/order-materials')}
            className="card-elevated group cursor-pointer p-6 transition-all hover:border-accent/40 sm:p-8"
          >
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 transition-colors group-hover:bg-accent/20 sm:h-16 sm:w-16">
              <ShoppingCart className="h-7 w-7 text-accent sm:h-8 sm:w-8" />
            </div>
            <h2 className="mb-2 text-lg font-semibold sm:text-xl">Order Materials</h2>
            <p className="mb-6 text-sm text-muted-foreground sm:text-base">
              Buy materials from hardware stores without requesting a service provider.
            </p>
            <div className="flex items-center gap-2 text-accent font-medium text-sm group-hover:gap-3 transition-all">
              Continue
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
