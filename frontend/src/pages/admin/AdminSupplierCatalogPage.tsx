import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { getAdminSupplierDetail } from '@/lib/api/admin';
import { ArrowLeft, Building2, ChevronRight, Package, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function AdminSupplierCatalogPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const id = supplierId?.trim() ?? '';
  const [q, setQ] = useState('');

  const detailQuery = useQuery({
    queryKey: ['admin', 'supplier', id],
    queryFn: () => getAdminSupplierDetail(id),
    enabled: Boolean(id),
    retry: false,
  });

  const supplier = detailQuery.data?.supplier;
  const displayBusiness = supplier?.businessName || supplier?.name || 'Supplier';

  const branches = supplier?.branches ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return branches;
    return branches.filter((b) => {
      const label = (b.displayName || b.name || '').toLowerCase();
      const geo = [b.address, b.city, b.area].filter(Boolean).join(' ').toLowerCase();
      return label.includes(s) || geo.includes(s);
    });
  }, [branches, q]);

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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-8 animate-fade-in p-4 pb-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 w-fit gap-1 text-muted-foreground"
              onClick={() => navigate(`/admin/suppliers/${encodeURIComponent(id)}`)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to supplier
            </Button>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-7 w-7 text-primary" />
              Catalog by branch
            </h1>
            <p className="text-muted-foreground text-sm max-w-xl">
              {displayBusiness} — choose a branch to view its product catalog (inventory is stored per storefront).
            </p>
          </div>
        </div>

        <div className="relative rounded-xl border-2 border-primary bg-card p-2 shadow-sm">
          <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search branches by name, city, or address…"
            className="h-11 border-0 pl-11 shadow-none focus-visible:ring-0"
          />
        </div>

        {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading branches…</p>}

        {!detailQuery.isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-8 text-center">
            No branches match your search.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((b) => {
            const n = Array.isArray(b.products) ? b.products.length : 0;
            return (
              <Link
                key={b.id}
                to={`/admin/suppliers/${encodeURIComponent(id)}/branches/${encodeURIComponent(b.id)}/catalog`}
                className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full border-2 border-primary/70 shadow-md transition-all hover:border-primary hover:shadow-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-start justify-between gap-2 text-lg">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </span>
                        <span className="truncate">{b.displayName || b.name}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {[b.address, b.city, b.area].filter(Boolean).join(' · ') || 'No address on file'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 pb-5">
                    <Badge variant="secondary" className="font-normal tabular-nums">
                      {n} product{n === 1 ? '' : 's'}
                    </Badge>
                    {b.isActive === false && (
                      <Badge variant="outline" className="font-normal">
                        Inactive
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
