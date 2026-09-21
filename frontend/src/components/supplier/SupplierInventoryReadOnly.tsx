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
import { Building2 } from 'lucide-react';
import { ProductCardSkeleton } from '@/components/common/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CatalogBreadcrumbs,
  CatalogCategoryCard,
  CatalogCategoryGrid,
  CatalogProductCard,
  CatalogProductGrid,
  CatalogToolbar,
  filterAndSortProducts,
  filterCatalogCategories,
  formatCategoryLabel,
  mergeCatalogCategories,
  resolveCategoryImageUrl,
  type CatalogProductFilters,
} from '@/components/catalog';

export function SupplierInventoryReadOnly({ userId }: { userId: string }) {
  const [cityFilter, setCityFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [pickedBranchId, setPickedBranchId] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [catalogFilters, setCatalogFilters] = useState<CatalogProductFilters>({
    search: '',
    category: 'all',
    availability: 'all',
    qualityTier: 'all',
    special: 'all',
    sort: 'name_asc',
  });

  const { data: branchRowsData } = useQuery({
    queryKey: ['supplier', 'analytics', 'branches', 'inv-ro', userId, cityFilter, searchQ],
    queryFn: () =>
      getSupplierAnalyticsBranches({
        ...(cityFilter ? { city: cityFilter } : {}),
        ...(searchQ.trim() ? { q: searchQ.trim() } : {}),
      }),
    enabled: Boolean(userId),
  });
  const branchRows = useMemo(() => branchRowsData?.branches ?? [], [branchRowsData?.branches]);

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

  const catalogCategories = useMemo(
    () => mergeCatalogCategories(insight?.inventoryCategories, insight?.products ?? [], { includeInactive: true }),
    [insight?.inventoryCategories, insight?.products]
  );

  const visibleCategories = useMemo(() => {
    return filterCatalogCategories(catalogCategories, catalogFilters.search ?? '', insight?.products);
  }, [catalogCategories, catalogFilters.search, insight?.products]);

  const filteredProducts = useMemo(() => {
    const list = insight?.products ?? [];
    return filterAndSortProducts(list, {
      ...catalogFilters,
      category: expandedCategory || catalogFilters.category,
    });
  }, [insight?.products, catalogFilters, expandedCategory]);

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
      <CatalogBreadcrumbs
        backLabel={expandedCategory ? 'Back to categories' : 'All branches'}
        onBack={() => {
          if (expandedCategory) {
            setExpandedCategory(null);
            return;
          }
          setPickedBranchId(null);
          setCatalogFilters((prev) => ({ ...prev, search: '', category: 'all' }));
        }}
        items={[
          {
            label: 'Branches',
            onClick: () => {
              setPickedBranchId(null);
              setExpandedCategory(null);
            },
          },
          ...(expandedCategory ? [{ label: formatCategoryLabel(expandedCategory) }] : [{ label: 'Categories' }]),
        ]}
      />

      <CatalogToolbar
        mode={expandedCategory ? 'products' : 'categories'}
        filters={catalogFilters}
        onChange={setCatalogFilters}
        categoryKeys={catalogCategories.map((c) => c.key)}
        hideCategory={Boolean(expandedCategory)}
        searchPlaceholder={expandedCategory ? 'Search products' : 'Search categories or products'}
      />

      {insightLoading && <ProductCardSkeleton count={8} />}

      {!insightLoading && !expandedCategory && visibleCategories.length === 0 && (
        <p className="text-sm text-muted-foreground">No categories match filters.</p>
      )}

      {!insightLoading && !expandedCategory && (
        <CatalogCategoryGrid>
          {visibleCategories.map((cat) => (
            <CatalogCategoryCard
              key={cat.id || cat.key}
              name={cat.name}
              imageUrl={resolveCategoryImageUrl(cat, insight?.products ?? [])}
              productCount={cat.productCount}
              unavailable={cat.productCount === 0}
              onSelect={() => setExpandedCategory(cat.key)}
            />
          ))}
        </CatalogCategoryGrid>
      )}

      {!insightLoading && expandedCategory && filteredProducts.length === 0 && (
        <p className="text-sm text-muted-foreground">No products match filters.</p>
      )}

      {!insightLoading && expandedCategory && (
        <CatalogProductGrid>
          {filteredProducts.map((p: SupplierBranchInventoryInsightProduct) => (
            <CatalogProductCard
              key={p.id}
              product={{
                id: p.id,
                name: p.name,
                category: p.category,
                price: p.price,
                unit: p.unit,
                inStock: p.inStock,
                quantity: p.quantity,
                qualityTier: p.qualityTier as 'low' | 'medium' | 'high' | undefined,
                image: p.image,
                description: p.description,
              }}
              details={
                <p className="mt-2 text-xs text-muted-foreground">
                  Stock: {p.quantity} · Sold (non-cancelled): {p.unitsSold}
                  {p.unitsAddedApprox != null ? ` · Est. added: ${p.unitsAddedApprox}` : ''}
                </p>
              }
            />
          ))}
        </CatalogProductGrid>
      )}
    </div>
  );
}
