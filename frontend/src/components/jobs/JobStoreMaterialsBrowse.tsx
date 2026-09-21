import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Supplier, Product, MaterialLine, JobLocation } from '@/types';
import { getBranchesNearby, type StoreRow } from '@/lib/api/stores';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import {
  ArrowLeft,
  Plus,
  Minus,
  ShoppingCart,
  Store,
  Truck,
  Sparkles,
  MapPin,
  Loader2,
  Navigation,
  Search,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CatalogBreadcrumbs,
  CatalogCategoryCard,
  CatalogCategoryGrid,
  CatalogProductCard,
  CatalogProductGrid,
  CatalogToolbar,
  canonicalInventoryCategory,
  filterAndSortProducts,
  filterCatalogCategories,
  formatCategoryLabel,
  mergeCatalogCategories,
  prioritizeCategoryKey,
  resolveCategoryImageUrl,
  type CatalogProductFilters,
} from '@/components/catalog';
import { formatCurrency } from '@/lib/formatCurrency';
import { categoryKeysMatch } from '@/lib/categoryKey';
import { formatDistanceKm, haversineKm } from '@/lib/geo/haversine';
import {
  distanceProximityBand,
  distanceProximityBadgeClass,
  distanceProximityCardClass,
  distanceProximityLabel,
} from '@/lib/geo/distanceProximity';

export type JobStoreMaterialsBrowseVariant = 'provider_cart' | 'user_suggestion';

export type JobStoreMaterialsBrowseProps =
  | {
      variant: 'provider_cart';
      jobLocation?: JobLocation | null;
      jobCategory: string;
      existingMaterials?: MaterialLine[];
      onBack: () => void;
      onSaveCart: (materials: MaterialLine[]) => void | Promise<void>;
    }
  | {
      variant: 'user_suggestion';
      jobLocation?: JobLocation | null;
      jobCategory: string;
      onBack: () => void;
      onSendSuggestion: (materials: MaterialLine[], message: string) => Promise<void>;
    };

export function JobStoreMaterialsBrowse(props: JobStoreMaterialsBrowseProps) {
  const { variant, jobLocation, jobCategory, onBack } = props;
  const incomingMaterials = variant === 'provider_cart' ? props.existingMaterials : undefined;
  const existingMaterials = useMemo(() => incomingMaterials ?? [], [incomingMaterials]);
  const saveCartFn = variant === 'provider_cart' ? props.onSaveCart : undefined;
  const suggestFn = variant === 'user_suggestion' ? props.onSendSuggestion : undefined;
  const [view, setView] = useState<'stores' | 'categories' | 'products'>('stores');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedInventoryCategory, setSelectedInventoryCategory] = useState<string | null>(null);
  const [catalogFilters, setCatalogFilters] = useState<CatalogProductFilters>({
    search: '',
    category: 'all',
    availability: 'all',
    qualityTier: 'all',
    special: 'all',
    sort: 'name_asc',
  });
  const [storeSearch, setStoreSearch] = useState('');
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [cart, setCart] = useState<Record<string, { product: Product; qty: number; supplier: Supplier }>>({});
  const [message, setMessage] = useState('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [isSavingCart, setIsSavingCart] = useState(false);

  const jobSiteCoords = useMemo(() => {
    const lat = jobLocation?.coordinates?.lat;
    const lng = jobLocation?.coordinates?.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }, [jobLocation?.coordinates?.lat, jobLocation?.coordinates?.lng]);

  const jobSiteLabel = useMemo(() => {
    const city = jobLocation?.city?.trim();
    const addr = jobLocation?.address?.trim();
    if (addr && city) return `${addr}, ${city}`;
    return addr || city || 'job site';
  }, [jobLocation?.address, jobLocation?.city]);

  const resolveStoreDistanceKm = useCallback(
    (s: StoreRow): number | null => {
      if (typeof s.distanceKm === 'number' && Number.isFinite(s.distanceKm)) {
        return s.distanceKm;
      }
      if (
        jobSiteCoords &&
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number' &&
        Number.isFinite(s.latitude) &&
        Number.isFinite(s.longitude)
      ) {
        return haversineKm(jobSiteCoords.lat, jobSiteCoords.lng, s.latitude, s.longitude);
      }
      return null;
    },
    [jobSiteCoords]
  );

  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      const dA = resolveStoreDistanceKm(a);
      const dB = resolveStoreDistanceKm(b);
      if (dA != null && dB != null && dA !== dB) return dA - dB;
      if (dA != null && dB == null) return -1;
      if (dA == null && dB != null) return 1;
      return String(a.displayName || a.name).localeCompare(String(b.displayName || b.name));
    });
  }, [stores, resolveStoreDistanceKm]);

  useEffect(() => {
    let alive = true;
    setStoresLoading(true);
    void getBranchesNearby({
      city: jobLocation?.city?.trim(),
      metro: jobLocation?.metro?.trim(),
      area: jobLocation?.area?.trim(),
      suburb: jobLocation?.suburb?.trim(),
      lat: jobSiteCoords?.lat,
      lng: jobSiteCoords?.lng,
      q: storeSearch.trim() || undefined,
    })
      .then((list) => {
        if (alive) setStores(list);
      })
      .catch(() => {
        if (alive) setStores([]);
      })
      .finally(() => {
        if (alive) setStoresLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [jobLocation?.city, jobLocation?.metro, jobLocation?.area, jobLocation?.suburb, jobSiteCoords?.lat, jobSiteCoords?.lng, storeSearch]);

  useEffect(() => {
    if (variant !== 'provider_cart') return;
    if (existingMaterials.length > 0) {
      const initialCart: Record<string, { product: Product; qty: number; supplier: Supplier }> = {};
      for (const mat of existingMaterials) {
        const storeKey = mat.branchId ?? mat.supplierId;
        const supplier: Supplier = {
          id: storeKey,
          name: mat.supplierName,
          displayName: mat.supplierName,
          branchId: mat.branchId,
          supplierId: mat.branchId && mat.supplierId !== mat.branchId ? mat.supplierId : undefined,
          hasDelivery: false,
          products: [],
        };
        const product: Product = {
          id: mat.productId,
          name: mat.name,
          category: jobCategory,
          price: mat.unitPrice,
          qualityTier: mat.qualityTier,
          unit: mat.unit || 'unit',
          inStock: true,
          image: (mat as MaterialLine & { imageUrl?: string }).imageUrl,
        };
        const key = `${storeKey}-${mat.productId}`;
        initialCart[key] = { product, qty: mat.qty, supplier };
      }
      setCart(initialCart);
    } else {
      setCart({});
    }
  }, [variant, jobCategory, existingMaterials]);

  const resetProductsUi = useCallback(() => {
    setCatalogFilters({
      search: '',
      category: 'all',
      availability: 'all',
      qualityTier: 'all',
      special: 'all',
      sort: 'name_asc',
    });
    setSelectedInventoryCategory(null);
    setMessage('');
    if (variant === 'user_suggestion') {
      setCart({});
    }
  }, [variant]);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setView('categories');
    resetProductsUi();
    if (variant === 'user_suggestion') {
      setCart({});
    }
  };

  const storeTitle = (s: StoreRow) => s.displayName || s.name;

  const filteredProducts = useMemo(() => {
    if (!selectedSupplier) return [] as Product[];
    const stockOk = variant === 'user_suggestion' ? (p: Product) => p.inStock !== false : () => true;
    let list = selectedSupplier.products.filter(stockOk);
    if (selectedInventoryCategory) {
      list = list.filter(
        (p) => canonicalInventoryCategory(p.category) === canonicalInventoryCategory(selectedInventoryCategory)
      );
    }
    return filterAndSortProducts(list, {
      ...catalogFilters,
      category: selectedInventoryCategory || 'all',
    });
  }, [selectedSupplier, variant, catalogFilters, selectedInventoryCategory]);

  const catalogCategories = useMemo(() => {
    if (!selectedSupplier) return [];
    const ok = variant === 'user_suggestion' ? (p: Product) => p.inStock !== false : () => true;
    const products = selectedSupplier.products.filter(ok);
    const merged = mergeCatalogCategories(selectedSupplier.inventoryCategories, products, {
      includeInactive: false,
    });
    return prioritizeCategoryKey(merged, jobCategory);
  }, [selectedSupplier, variant, jobCategory]);

  const visibleCategories = useMemo(() => {
    return filterCatalogCategories(catalogCategories, catalogFilters.search ?? '', selectedSupplier?.products);
  }, [catalogCategories, catalogFilters.search, selectedSupplier?.products]);

  const handleAddToCart = (product: Product, supplier: Supplier) => {
    const key = `${supplier.id}-${product.id}`;
    setCart((prev) => ({
      ...prev,
      [key]: {
        product,
        qty: (prev[key]?.qty || 0) + 1,
        supplier,
      },
    }));
  };

  const handleRemoveFromCart = (product: Product, supplier: Supplier) => {
    const key = `${supplier.id}-${product.id}`;
    setCart((prev) => {
      const current = prev[key];
      if (!current || current.qty <= 1) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [key]: { ...current, qty: current.qty - 1 },
      };
    });
  };

  const getCartQty = (productId: string, supplierId: string) => cart[`${supplierId}-${productId}`]?.qty || 0;

  const cartTotal = Object.values(cart).reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartItemCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);

  const linesFromCart = useCallback((): MaterialLine[] => {
    return Object.values(cart).map((item) => {
      const storeRow = item.supplier as StoreRow;
      const branchId = storeRow.branchId ?? storeRow.id;
      const label = item.supplier.displayName || item.supplier.name;
      return {
        branchId,
        supplierId: branchId,
        supplierName: label,
        productId: item.product.id,
        name: item.product.name,
        qty: item.qty,
        unitPrice: item.product.price,
        qualityTier: item.product.qualityTier,
        unit: item.product.unit,
        isExtra: !categoryKeysMatch(item.product.category, jobCategory),
        ...(item.product.image && { imageUrl: item.product.image }),
      };
    });
  }, [cart, jobCategory]);

  const handleSaveToJob = async () => {
    if (!saveCartFn || cartItemCount === 0 || variant !== 'provider_cart') return;
    setIsSavingCart(true);
    try {
      await Promise.resolve(saveCartFn(linesFromCart()));
      onBack();
    } finally {
      setIsSavingCart(false);
    }
  };

  const handleSubmitSuggestion = async () => {
    if (cartItemCount === 0 || variant !== 'user_suggestion' || !suggestFn) return;
    setIsSubmittingUser(true);
    try {
      await suggestFn(
        linesFromCart(),
        message.trim() || 'I found these alternatives — please consider them.'
      );
      onBack();
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const headline =
    variant === 'provider_cart'
      ? view === 'stores'
        ? 'Choose a store branch'
        : view === 'categories'
          ? storeTitle(selectedSupplier as StoreRow)
          : formatCategoryLabel(selectedInventoryCategory || jobCategory)
      : view === 'stores'
        ? 'Suggest alternative materials'
        : view === 'categories'
          ? storeTitle(selectedSupplier as StoreRow)
          : formatCategoryLabel(selectedInventoryCategory || jobCategory);

  const subline =
    view === 'stores'
      ? variant === 'provider_cart'
        ? 'Branches are ranked near the job site — search anywhere to widen results.'
        : 'Pick an in-stock branch near the job. Your provider will review your suggestion.'
      : view === 'categories'
        ? 'Choose a category to browse products. Other valid categories stay available for extra materials.'
        : variant === 'provider_cart'
          ? 'Search and filter, then add items to send to your customer.'
          : 'Add items with quantities, then send your suggestion to the provider.';

  return (
    <>
      <div className="relative mx-auto w-full max-w-5xl pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
      <header className="border-b border-border pb-4 space-y-1">
        <div className="flex items-start gap-2">
          {view !== 'stores' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 mt-0.5"
              onClick={() => {
                if (view === 'products') {
                  setView('categories');
                  setSelectedInventoryCategory(null);
                  return;
                }
                setView('stores');
                setSelectedSupplier(null);
                resetProductsUi();
              }}
              aria-label={view === 'products' ? 'Back to categories' : 'Back to branches'}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={onBack} aria-label="Go back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {variant === 'user_suggestion' && (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Lightbulb className="h-4 w-4" />
                </span>
              )}
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">{headline}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-prose">{subline}</p>
          </div>
        </div>
      </header>

      <div className="space-y-5 py-6">
        {view === 'stores' && (
          <>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Ranking branches near <span className="font-medium text-foreground">{jobSiteLabel}</span>
                {jobSiteCoords ? ' (by distance)' : jobLocation?.city ? '' : ' — add job coordinates for distance sorting'}
              </span>
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={variant === 'provider_cart' ? 'Search branches or brands…' : 'Search store or brand…'}
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl bg-muted/40 border-transparent focus-visible:ring-ring"
              />
            </div>
            {storesLoading && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Loading branches…</span>
              </div>
            )}
            {!storesLoading && (
              <ul className="m-0 list-none space-y-3 p-0 pb-6">
                {sortedStores.map((supplier) => {
                  const distKm = resolveStoreDistanceKm(supplier);
                  const proxBand = distanceProximityBand(distKm);
                  return (
                  <li key={supplier.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectSupplier(supplier)}
                      className={cn(
                        'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left',
                        distanceProximityCardClass(proxBand),
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-lg leading-none">
                        {resolveUploadUrl(supplier.logo) ? (
                          <img src={resolveUploadUrl(supplier.logo)} alt="" className="h-12 w-12 rounded-xl object-cover" />
                        ) : (
                          <Store className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{storeTitle(supplier)}</p>
                        {supplier.address?.trim() && (
                          <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="break-words">{supplier.address.trim()}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3 text-xs text-muted-foreground">
                          {distKm != null && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium',
                                distanceProximityBadgeClass(proxBand)
                              )}
                            >
                              <Navigation className="h-3 w-3" />
                              {formatDistanceKm(distKm)} · {distanceProximityLabel(proxBand)}
                            </span>
                          )}
                          {supplier.hasDelivery && (
                            <Badge variant="secondary" className="text-[10px] font-normal gap-1">
                              <Truck className="h-3 w-3" /> Delivery
                            </Badge>
                          )}
                          {supplier.products.some((p) => p.special) && (
                            <Badge className="bg-accent text-accent-foreground text-[10px] font-normal gap-1">
                              <Sparkles className="h-3 w-3" /> Specials
                            </Badge>
                          )}
                          <span className="self-center">{supplier.products.length} products</span>
                        </div>
                      </div>
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
            {!storesLoading && sortedStores.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-16">
                No stores match this search or area. Try another keyword or widen your search.
              </p>
            )}
          </>
        )}

        {view === 'categories' && selectedSupplier && (
          <div className="space-y-4 pb-4">
            <CatalogToolbar
              mode="categories"
              filters={catalogFilters}
              onChange={setCatalogFilters}
              hideCategory
              searchPlaceholder="Search categories or products"
            />
            {visibleCategories.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">No categories match this search.</p>
            ) : (
              <CatalogCategoryGrid>
                {visibleCategories.map((cat) => (
                  <CatalogCategoryCard
                    key={cat.id || cat.key}
                    name={cat.name}
                    imageUrl={resolveCategoryImageUrl(cat, selectedSupplier.products)}
                    productCount={cat.productCount}
                    highlighted={canonicalInventoryCategory(jobCategory) === cat.key}
                    unavailable={cat.productCount === 0}
                    onSelect={() => {
                      setSelectedInventoryCategory(cat.key);
                      setView('products');
                    }}
                  />
                ))}
              </CatalogCategoryGrid>
            )}
          </div>
        )}

        {view === 'products' && selectedSupplier && (
          <div className="space-y-4 pb-4">
            <CatalogBreadcrumbs
              backLabel="Back to categories"
              onBack={() => {
                setView('categories');
                setSelectedInventoryCategory(null);
              }}
              items={[
                {
                  label: storeTitle(selectedSupplier as StoreRow),
                  onClick: () => {
                    setView('categories');
                    setSelectedInventoryCategory(null);
                  },
                },
                { label: formatCategoryLabel(selectedInventoryCategory || 'all') },
              ]}
            />
            <CatalogToolbar
              mode="products"
              filters={catalogFilters}
              onChange={setCatalogFilters}
              hideCategory
              searchPlaceholder="Search products in this category"
            />

            {filteredProducts.length === 0 && (
              <p className="text-center text-muted-foreground py-16 text-sm">
                {catalogFilters.search?.trim()
                  ? 'Nothing matches — try adjusting search or filters.'
                  : 'No products in this category.'}
              </p>
            )}

            <CatalogProductGrid>
              {filteredProducts.map((product) => {
                const qty = getCartQty(product.id, selectedSupplier.id);
                return (
                  <CatalogProductCard
                    key={product.id}
                    product={product}
                    selected={qty > 0}
                    actions={
                      qty > 0 ? (
                        <>
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => handleRemoveFromCart(product, selectedSupplier)} aria-label="Remove one">
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center text-xs font-semibold tabular-nums">{qty}</span>
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => handleAddToCart(product, selectedSupplier)} aria-label="Add one">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button type="button" size="sm" className="h-8 gap-1 px-3 text-xs" onClick={() => handleAddToCart(product, selectedSupplier)}>
                          <Plus className="size-4" /> Add
                        </Button>
                      )
                    }
                  />
                );
              })}
            </CatalogProductGrid>

            {variant === 'user_suggestion' && cartItemCount > 0 && (
              <section className="rounded-xl border border-border bg-muted/20 p-4 space-y-4 mt-8">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected items</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {cartItemCount} item{cartItemCount === 1 ? '' : 's'} ·{' '}
                    <span className="font-semibold text-foreground">{formatCurrency(cartTotal, { decimals: 2 })}</span>
                  </p>
                </div>
                <div>
                  <Label htmlFor="browse-suggest-msg" className="text-muted-foreground">
                    Message to provider (optional)
                  </Label>
                  <Textarea
                    id="browse-suggest-msg"
                    placeholder="Why you're suggesting these alternatives…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="mt-2 rounded-xl resize-none"
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Single page scroll lives on DashboardLayout main; footer is viewport-fixed */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 lg:left-64',
          'border-t border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85',
          'shadow-[0_-10px_40px_-18px_rgb(0,0,0,0.18)] dark:shadow-[0_-12px_40px_-14px_rgb(0,0,0,0.5)]'
        )}
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        {variant === 'provider_cart' && view !== 'stores' ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-[2.5rem] flex-1 flex-wrap items-center gap-2 text-sm text-muted-foreground sm:max-w-xl">
              {cartItemCount > 0 ? (
                <>
                  <ShoppingCart className="h-4 w-4 shrink-0 text-foreground opacity-70" aria-hidden />
                  <span className="tabular-nums leading-snug text-foreground">
                    <span className="text-muted-foreground">{cartItemCount} items · </span>
                    <span className="font-semibold">{formatCurrency(cartTotal, { decimals: 2 })}</span>
                  </span>
                </>
              ) : (
                <span className="text-sm italic text-muted-foreground">Add items to preview totals here.</span>
              )}
            </div>
            <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button type="button" variant="outline" onClick={onBack} className="min-[480px]:flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button type="button" className="min-[480px]:flex-1 sm:flex-none" onClick={() => void handleSaveToJob()} disabled={cartItemCount === 0 || isSavingCart}>
                {isSavingCart ? 'Saving…' : 'Save to job'}
              </Button>
            </div>
          </div>
        ) : variant === 'user_suggestion' && view !== 'stores' ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-[2.5rem] flex-1 flex-wrap items-center gap-2 text-sm text-muted-foreground sm:max-w-xl">
              {cartItemCount > 0 ? (
                <>
                  <ShoppingCart className="h-4 w-4 shrink-0 text-foreground opacity-70" aria-hidden />
                  <span className="tabular-nums leading-snug text-foreground">
                    <span className="text-muted-foreground">{cartItemCount} items · </span>
                    <span className="font-semibold">{formatCurrency(cartTotal, { decimals: 2 })}</span>
                  </span>
                </>
              ) : (
                <span className="text-sm italic text-muted-foreground">Add items to your suggestion list.</span>
              )}
            </div>
            <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button type="button" variant="outline" onClick={onBack} className="min-[480px]:flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button
                type="button"
                className="min-[480px]:flex-1 sm:flex-none"
                onClick={() => void handleSubmitSuggestion()}
                disabled={cartItemCount === 0 || isSubmittingUser}
              >
                {isSubmittingUser ? 'Sending…' : 'Send suggestion'}
              </Button>
            </div>
          </div>
        ) : variant === 'provider_cart' ? (
          <div className="flex w-full justify-end sm:flex-initial">
            <Button type="button" variant="outline" onClick={onBack}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <Button type="button" variant="outline" onClick={onBack}>
              Close
            </Button>
          </div>
        )}
        </div>
      </div>
    </>
  );
}

