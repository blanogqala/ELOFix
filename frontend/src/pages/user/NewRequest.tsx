import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Wrench, ShoppingCart, ArrowRight } from 'lucide-react';

export default function NewRequest() {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto animate-fade-in py-8">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold mb-2">What would you like to do?</h1>
          <p className="text-muted-foreground">Choose an option below to get started</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Request a Service */}
          <div
            onClick={() => navigate('/user/request/service')}
            className="card-elevated p-8 cursor-pointer hover:border-primary/40 transition-all group"
          >
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
              <Wrench className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Request a Service</h2>
            <p className="text-muted-foreground text-sm mb-6">
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
            className="card-elevated p-8 cursor-pointer hover:border-accent/40 transition-all group"
          >
            <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent/20 transition-colors">
              <ShoppingCart className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Order Materials</h2>
            <p className="text-muted-foreground text-sm mb-6">
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
