import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { getAdminSupplierDetail } from '@/lib/api/admin';
import type { Product } from '@/types';
import { ArrowLeft, Building2, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';

function formatCategoryLabel(raw: string) {
  const s = (raw || 'general').trim().replace(/_/g, ' ');
  if (!s) return 'General';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupProductsByCategory(products: Product[]): { label: string; items: Product[] }[] {
  const m = new Map<string, Product[]>();
  for (const p of products || []) {
    const key = (p.category || 'general').trim().toLowerCase() || 'general';
    const list = m.get(key) ?? [];
    list.push(p);
    m.set(key, list);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, items]) => ({
      label: formatCategoryLabel(key),
      items: items.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }));
}

export default function AdminSupplierBranchCatalogPage() {
  const { supplierId, branchId } = useParams<{ supplierId: string; branchId: string }>();
  const navigate = useNavigate();
  const sid = supplierId?.trim() ?? '';
  const bid = branchId?.trim() ?? '';

  const detailQuery = useQuery({
    queryKey: ['admin', 'supplier', sid],
    queryFn: () => getAdminSupplierDetail(sid),
    enabled: Boolean(sid),
    retry: false,
  });

  const supplier = detailQuery.data?.supplier;
  const branch = useMemo(
    () => (supplier?.branches ?? []).find((b) => b.id === bid),
    [supplier?.branches, bid]
  );
  const catalogGroups = useMemo(() => groupProductsByCategory(branch?.products ?? []), [branch?.products]);

  const displayBusiness = supplier?.businessName || supplier?.name || 'Supplier';

  if (detailQuery.isError || (!detailQuery.isLoading && !supplier)) {
    return (
      <DashboardLayout>
        <div className="space-y-4 animate-fade-in max-w-lg p-4">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate('/admin/suppliers')}>
            <ArrowLeft className="h-4 w-4" />
            Back to suppliers
          </Button>
          <p className="text-sm text-destructive">Supplier not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!detailQuery.isLoading && supplier && !branch) {
    return (
      <DashboardLayout>
        <div className="space-y-4 animate-fade-in max-w-lg p-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1"
            onClick={() => navigate(`/admin/suppliers/${encodeURIComponent(sid)}/catalog`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to branches
          </Button>
          <p className="text-sm text-destructive">Branch not found for this supplier.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-8 animate-fade-in p-4 pb-16">
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 w-fit gap-1 text-muted-foreground"
            onClick={() => navigate(`/admin/suppliers/${encodeURIComponent(sid)}/catalog`)}
          >
            <ArrowLeft className="h-4 w-4" />
            All branches
          </Button>
          <div className="rounded-xl border-2 border-primary bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{displayBusiness}</p>
                <h1 className="text-2xl font-bold tracking-tight">{branch?.displayName || branch?.name || 'Branch'}</h1>
                <p className="text-sm text-muted-foreground">
                  {[branch?.address, branch?.city, branch?.area].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}

        {!detailQuery.isLoading && catalogGroups.length === 0 && (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No products listed for this branch yet.
          </p>
        )}

        {catalogGroups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Layers className="h-5 w-5 text-primary" />
              {group.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((p) => (
                <Card key={p.id} className="overflow-hidden border-2 border-primary/70 shadow-sm">
                  <CardHeader className="space-y-1 pb-2">
                    <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{formatCategoryLabel(p.category || '')}</p>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    <p className="text-lg font-semibold tabular-nums">{formatCurrency(p.price)}</p>
                    <Badge variant={p.inStock ? 'default' : 'secondary'} className="font-normal">
                      {p.inStock ? 'In stock' : 'Out of stock'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DashboardLayout>
  );
}
