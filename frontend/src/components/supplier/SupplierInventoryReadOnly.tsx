import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getSupplierAnalyticsBranches,
  getSupplierAnalyticsBranchInventory,
  type SupplierBranchInventoryInsightProduct,
} from '@/lib/api/supplierPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatCurrency';
import { ArrowLeft, Building2, Search } from 'lucide-react';
import { ProductCardSkeleton } from '@/components/common/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function groupByCategory(products: SupplierBranchInventoryInsightProduct[]) {
  const m = new Map<string, SupplierBranchInventoryInsightProduct[]>();
  for (const p of products) {
    const c = p.category || 'general';
    if (!m.has(c)) m.set(c, []);
    m.get(c)!.push(p);
  }
  return m;
}

export function SupplierInventoryReadOnly({ userId }: { userId: string }) {
  const [cityFilter, setCityFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [pickedBranchId, setPickedBranchId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: branchRows = [] } = useQuery({
    queryKey: ['supplier', 'analytics', 'branches', 'inv-ro', userId, cityFilter, searchQ],
    queryFn: () =>
      getSupplierAnalyticsBranches({
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(searchQ.trim() ? { q: searchQ.trim() } : {}),
      }),
    enabled: Boolean(userId),
  });

  const distinctCities = useMemo(() => {
    const s = new Set<string>();
    for (const b of branchRows) {
      const c = (b.city || '').trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [branchRows]);

  const { data: insight, isLoading: insightLoading } = useQuery({
    queryKey: ['supplier', 'analytics', 'branch-inventory', userId, pickedBranchId],
    queryFn: () => getSupplierAnalyticsBranchInventory(pickedBranchId!),
    enabled: Boolean(userId && pickedBranchId),
  });

  const filteredProducts = useMemo(() => {
    const list = insight?.products ?? [];
    const q = productSearch.trim().toLowerCase();
    return list.filter((p) => {
      if (categoryFilter !== 'all' && String(p.category) !== categoryFilter) return false;
      if (!q) return true;
      return (
        String(p.name || '')
          .toLowerCase()
          .includes(q) || String(p.category || '').toLowerCase().includes(q)
      );
    });
  }, [insight?.products, productSearch, categoryFilter]);

  const byCat = useMemo(() => groupByCategory(filteredProducts), [filteredProducts]);

  if (!pickedBranchId) {
    return (
      <div className="space-y-4 ">
        <p className="text-sm text-muted-foreground">
          Read-only inventory by branch. Select a branch to view products and units sold (non-cancelled orders).
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex w-full flex-col gap-1.5 sm:w-56">
            <Label className="text-xs text-muted-foreground">City</Label>
            <Select value={cityFilter || '__all__'} onValueChange={(v) => setCityFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All cities</SelectItem>
                {distinctCities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full flex-1 sm:max-w-sm">
            <Label className="text-xs text-muted-foreground">Search branches</Label>
            <Input
              className="mt-1.5"
              placeholder="Name, address, area…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branchRows.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2">No branches match filters.</p>
          )}
          {branchRows.map((b) => (
            <Card key={b.branchId} className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {b.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {[b.city, b.area].filter(Boolean).join(' · ') || b.address || '—'}
                </p>
              </CardHeader>
              <CardContent>
                <Button type="button" size="sm" className="w-full btn-accent" onClick={() => setPickedBranchId(b.branchId)}>
                  View inventory
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1 -ml-2"
        onClick={() => {
          setPickedBranchId(null);
          setProductSearch('');
          setCategoryFilter('all');
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        All branches
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search product or category"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(insight?.categories ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {insightLoading && <ProductCardSkeleton count={8} />}

      {!insightLoading && filteredProducts.length === 0 && (
        <p className="text-sm text-muted-foreground">No products match filters.</p>
      )}

      <div className="space-y-6">
        {[...byCat.entries()].map(([cat, items]) => (
          <Card key={cat} className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base capitalize">{cat}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-2 last:border-0 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Stock: {p.quantity} · Sold (non-cancelled): {p.unitsSold}
                      {p.unitsAddedApprox != null ? ` · Est. added: ${p.unitsAddedApprox}` : ''}
                    </p>
                  </div>
                  <p className="tabular-nums font-medium">{formatCurrency(p.price)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
