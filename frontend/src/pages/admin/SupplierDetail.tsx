import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProviderProfileSkeleton } from '@/components/common/loading';
import { Button } from '@/components/ui/button';
import { getAdminSupplierDetail } from '@/lib/api/admin';
import {
  ArrowLeft,
  Building2,
  Mail,
  Hash,
  Package,
  TrendingUp,
  Percent,
  ShoppingCart,
  GitBranch,
  LayoutGrid,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { cn } from '@/lib/utils';
import { AdminSupplierMaterialOrdersSection } from '@/components/admin/AdminSupplierMaterialOrdersSection';

export default function AdminSupplierDetail() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const id = supplierId?.trim() ?? '';

  const detailQuery = useQuery({
    queryKey: ['admin', 'supplier', id],
    queryFn: () => getAdminSupplierDetail(id),
    enabled: Boolean(id),
    retry: false,
  });

  const supplier = detailQuery.data?.supplier;
  const analytics = detailQuery.data?.analytics;
  const branchCount = supplier?.branches?.length ?? 0;

  if (detailQuery.isError) {
    return (
      <DashboardLayout>
        <div className="space-y-4 animate-fade-in max-w-lg">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate('/admin/suppliers')}>
            <ArrowLeft className="h-4 w-4" />
            Back to suppliers
          </Button>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm">
            <p className="font-medium text-destructive">Supplier not found</p>
            <p className="mt-1 text-muted-foreground">This link may be invalid or the supplier was removed.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (detailQuery.isLoading || !supplier) {
    return (
      <DashboardLayout>
        <ProviderProfileSkeleton />
      </DashboardLayout>
    );
  }

  const logoUrl = supplier.logo ? resolveUploadUrl(supplier.logo) : '';
  const displayBusiness = supplier.businessName || supplier.name;
  const commissionPct = Math.round((analytics?.commissionRate ?? 0.07) * 100);

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={() => navigate('/admin/suppliers')}>
            <ArrowLeft className="h-4 w-4" />
            Back to suppliers
          </Button>
        </div>

        <div className="rounded-xl border-2 border-primary bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div
              className={cn(
                'flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground'
              )}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-10 w-10 opacity-60" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{displayBusiness}</h1>
                <p className="text-sm text-muted-foreground">Supplier profile — read-only for admin</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium break-all">{supplier.linkedUserEmail || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">User ID</p>
                    <p className="font-mono text-xs break-all">{supplier.linkedUserId || supplier.userId || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Performance</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Revenue and commission below reflect all paid material orders ({commissionPct}% commission rate).
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/80 border-2 border-primary shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total orders</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{analytics?.orderCount ?? 0}</p>
                  </div>
                  <ShoppingCart className="h-5 w-5 shrink-0 text-primary opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/80 border-2 border-primary shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Revenue</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCurrency(analytics?.totalRevenue ?? 0)}
                    </p>
                  </div>
                  <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/80 border-2 border-primary shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Commission</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-accent">
                      {formatCurrency(analytics?.totalCommission ?? 0)}
                    </p>
                  </div>
                  <Percent className="h-5 w-5 shrink-0 text-accent opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/80 border-2 border-primary shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Branches</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{branchCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Storefronts / inventory scopes</p>
                  </div>
                  <GitBranch className="h-5 w-5 shrink-0 text-muted-foreground opacity-80" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="rounded-xl border-2 border-primary bg-gradient-to-br from-card via-card to-muted/25 p-6 shadow-md">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2 max-w-xl">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Package className="h-5 w-5 text-primary" />
                Catalog
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Inventory is maintained per branch. Open the hub to see each branch as its own container, then drill into
                products for that storefront.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="btn-accent shrink-0 gap-2 self-start lg:self-center px-6 shadow-sm"
              onClick={() => navigate(`/admin/suppliers/${encodeURIComponent(id)}/catalog`)}
            >
              <LayoutGrid className="h-5 w-5" />
              View catalog by branch
              <ChevronRight className="h-4 w-4 opacity-80" />
            </Button>
          </div>
        </div>

        <AdminSupplierMaterialOrdersSection
          supplierId={id}
          branches={supplier.branches ?? []}
          businessLabel={displayBusiness}
        />
      </div>
    </DashboardLayout>
  );
}
