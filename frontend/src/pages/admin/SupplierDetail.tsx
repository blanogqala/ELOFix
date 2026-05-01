import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { getAdminSupplierDetail, getAdminSupplierOrders, type AdminSupplierOrderRow } from '@/lib/api/admin';
import type { Product } from '@/types';
import {
  ArrowLeft,
  Building2,
  Mail,
  Hash,
  Package,
  TrendingUp,
  Percent,
  ShoppingCart,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { cn } from '@/lib/utils';

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

  const ordersQuery = useQuery<AdminSupplierOrderRow[]>({
    queryKey: ['admin', 'supplier', id, 'orders'],
    queryFn: () => getAdminSupplierOrders(id, 10),
    enabled: Boolean(id) && detailQuery.isSuccess,
  });

  const supplier = detailQuery.data?.supplier;
  const analytics = detailQuery.data?.analytics;

  const catalogGroups = useMemo(() => groupProductsByCategory(supplier?.products ?? []), [supplier?.products]);

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
        <p className="text-muted-foreground animate-fade-in">Loading…</p>
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
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg order</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCurrency(analytics?.averageOrderValue ?? 0)}
                    </p>
                  </div>
                  <BarChart3 className="h-5 w-5 shrink-0 text-muted-foreground opacity-80" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5" />
            Catalog
          </h2>
          {catalogGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No catalog items.</p>
          ) : (
            <div className="space-y-8">
              {catalogGroups.map((group) => (
                <div key={group.label}>
                  <h3 className="mb-3 text-sm font-semibold text-foreground/90">Category: {group.label}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((p) => (
                      <Card key={p.id} className="overflow-hidden border-border/80 border-2 border-primary shadow-sm">
                        <CardHeader className="space-y-1 pb-2">
                          <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{formatCategoryLabel(p.category || '')}</p>
                        </CardHeader>
                        <CardContent className="space-y-2 pb-4">
                          <p className="text-lg font-semibold">{formatCurrency(p.price)}</p>
                          <Badge variant={p.inStock ? 'default' : 'secondary'} className="font-normal">
                            {p.inStock ? 'In stock' : 'Out of stock'}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Recent orders</h2>
          <p className="mb-3 text-sm text-muted-foreground">Latest activity from this supplier (all statuses).</p>
          {ordersQuery.isLoading && <p className="text-sm text-muted-foreground">Loading orders…</p>}
          {!ordersQuery.isLoading && (ordersQuery.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          )}
          {!ordersQuery.isLoading && (ordersQuery.data?.length ?? 0) > 0 && (
            <div className="rounded-lg border-2 border-primary overflow-hidden bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ordersQuery.data || []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.id}</TableCell>
                      <TableCell>
                        <div className="text-sm">{o.customerName || '—'}</div>
                        {o.customerEmail && (
                          <div className="text-xs text-muted-foreground break-all">{o.customerEmail}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(Number(o.total ?? o.materialsSubtotal ?? 0))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {o.fulfillmentStatus && (
                            <Badge variant="outline" className="font-normal text-xs">
                              {o.fulfillmentStatus}
                            </Badge>
                          )}
                          {o.paymentStatus && (
                            <Badge variant="secondary" className="font-normal text-xs capitalize">
                              {o.paymentStatus}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
