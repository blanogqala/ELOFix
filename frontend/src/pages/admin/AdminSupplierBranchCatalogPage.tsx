import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { getAdminSupplierDetail } from '@/lib/api/admin';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

export default function AdminSupplierBranchCatalogPage() {
  const { supplierId, branchId } = useParams<{ supplierId: string; branchId: string }>();
  const navigate = useNavigate();
  const sid = supplierId?.trim() ?? '';
  const bid = branchId?.trim() ?? '';
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [catalogFilters, setCatalogFilters] = useState<CatalogProductFilters>({
    search: '',
    category: 'all',
    availability: 'all',
    qualityTier: 'all',
    special: 'all',
    sort: 'name_asc',
  });

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

  const catalogCategories = useMemo(
    () => mergeCatalogCategories(branch?.inventoryCategories, branch?.products ?? [], { includeInactive: true }),
    [branch?.inventoryCategories, branch?.products]
  );

  const visibleCategories = useMemo(
    () => filterCatalogCategories(catalogCategories, catalogFilters.search ?? '', branch?.products),
    [catalogCategories, catalogFilters.search, branch?.products]
  );

  const filteredProducts = useMemo(() => {
    return filterAndSortProducts(branch?.products ?? [], {
      ...catalogFilters,
      category: selectedCategory || catalogFilters.category,
    });
  }, [branch?.products, catalogFilters, selectedCategory]);

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
            onClick={() =>
              selectedCategory
                ? setSelectedCategory(null)
                : navigate(`/admin/suppliers/${encodeURIComponent(sid)}/catalog`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
            {selectedCategory ? 'Back to categories' : 'All branches'}
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
                {selectedCategory && (
                  <Badge variant="secondary" className="font-normal">
                    {formatCategoryLabel(selectedCategory)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <CatalogToolbar
          mode={selectedCategory ? 'products' : 'categories'}
          filters={catalogFilters}
          onChange={setCatalogFilters}
          categoryKeys={catalogCategories.map((c) => c.key)}
          hideCategory={Boolean(selectedCategory)}
          searchPlaceholder={selectedCategory ? 'Search products' : 'Search categories or products'}
        />

        {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}

        {!detailQuery.isLoading && !selectedCategory && visibleCategories.length === 0 && (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No products listed for this branch yet.
          </p>
        )}

        {!detailQuery.isLoading && !selectedCategory && (
          <CatalogCategoryGrid>
            {visibleCategories.map((cat) => (
              <CatalogCategoryCard
                key={cat.id || cat.key}
                name={cat.name}
                imageUrl={resolveCategoryImageUrl(cat, branch?.products ?? [])}
                productCount={cat.productCount}
                unavailable={cat.productCount === 0}
                onSelect={() => setSelectedCategory(cat.key)}
              />
            ))}
          </CatalogCategoryGrid>
        )}

        {selectedCategory && (
          <div className="space-y-4">
            <CatalogBreadcrumbs
              backLabel="Back to categories"
              onBack={() => setSelectedCategory(null)}
              items={[
                { label: branch?.displayName || branch?.name || 'Branch', onClick: () => setSelectedCategory(null) },
                { label: formatCategoryLabel(selectedCategory) },
              ]}
            />
            {filteredProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products match filters.</p>
            ) : (
              <CatalogProductGrid>
                {filteredProducts.map((p) => (
                  <CatalogProductCard key={p.id} product={p} />
                ))}
              </CatalogProductGrid>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
