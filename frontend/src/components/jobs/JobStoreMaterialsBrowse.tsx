import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { formatCurrency } from '@/lib/formatCurrency';
import { categoryKeysMatch } from '@/lib/categoryKey';
import { formatDistanceKm, haversineKm } from '@/lib/geo/haversine';
import {
  distanceProximityBand,
  distanceProximityBadgeClass,
  distanceProximityCardClass,
  distanceProximityLabel,
} from '@/lib/geo/distanceProximity';

const ALL_CATEGORIES_VALUE = '__all__';

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
      onSendSuggestion: (material: MaterialLine, message: string) => Promise<void>;
    };

/** Mirrors AddMaterialsModal + SuggestAlternativeMaterialsModal filtering before category dropdown. */
function computeBrowseCore(
  selectedSupplier: Supplier | null,
  jobCategory: string,
  variant: JobStoreMaterialsBrowseVariant,
  searchRaw: string
): { core: Product[]; showingCategoryFallback: boolean } {
  if (!selectedSupplier) return { core: [], showingCategoryFallback: false };

  const q = searchRaw.trim().toLowerCase();
  const bySearch = (p: Product) =>
    !q || p.name.toLowerCase().includes(q) || String(p.category ?? '').toLowerCase().includes(q);
  const byCat = (p: Product) => categoryKeysMatch(p.category, jobCategory);

  if (variant === 'user_suggestion') {
    const strict = selectedSupplier.products.filter((p) => bySearch(p) && byCat(p) && p.inStock);
    if (strict.length > 0) return { core: strict, showingCategoryFallback: false };
    if (!searchRaw.trim()) {
      return {
        core: selectedSupplier.products.filter((p) => p.inStock !== false),
        showingCategoryFallback: true,
      };
    }
    return {
      core: selectedSupplier.products.filter((p) => bySearch(p) && p.inStock !== false),
      showingCategoryFallback: true,
    };
  }

  const strict = selectedSupplier.products.filter((p) => bySearch(p) && byCat(p));
  if (strict.length > 0) return { core: strict, showingCategoryFallback: false };
  if (!searchRaw.trim()) {
    return {
      core: selectedSupplier.products.filter((p) => p.inStock !== false),
      showingCategoryFallback: true,
    };
  }
  return {
    core: selectedSupplier.products.filter(bySearch),
    showingCategoryFallback: true,
  };
}

export function JobStoreMaterialsBrowse(props: JobStoreMaterialsBrowseProps) {
  const { variant, jobLocation, jobCategory, onBack } = props;
  const existingMaterials = variant === 'provider_cart' ? props.existingMaterials ?? [] : [];
  const saveCartFn = variant === 'provider_cart' ? props.onSaveCart : undefined;
  const suggestFn = variant === 'user_suggestion' ? props.onSendSuggestion : undefined;
  const [view, setView] = useState<'stores' | 'products'>('stores');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES_VALUE);
  const [storeSearch, setStoreSearch] = useState('');
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [cart, setCart] = useState<Record<string, { product: Product; qty: number; supplier: Supplier }>>({});
  const [selectedProduct, setSelectedProduct] = useState<{ product: Product; supplier: Supplier } | null>(null);
  const [qtySuggest, setQtySuggest] = useState(1);
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
  }, [jobLocation?.city, jobSiteCoords?.lat, jobSiteCoords?.lng, storeSearch]);

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
    setSearchQuery('');
    setCategoryFilter(ALL_CATEGORIES_VALUE);
    setSelectedProduct(null);
    setQtySuggest(1);
    setMessage('');
  }, []);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setView('products');
    resetProductsUi();
  };

  const storeTitle = (s: StoreRow) => s.displayName || s.name;

  const filteredProductsResult = useMemo(() => {
    const browse = computeBrowseCore(selectedSupplier, jobCategory, variant, searchQuery);
    let list = browse.core;
    if (categoryFilter !== ALL_CATEGORIES_VALUE) {
      list = list.filter((p) => categoryKeysMatch(p.category, categoryFilter) || p.category === categoryFilter);
    }
    return { products: list, showingCategoryFallback: browse.showingCategoryFallback };
  }, [selectedSupplier, jobCategory, variant, categoryFilter, searchQuery]);

  const filteredProducts = filteredProductsResult.products;
  const showingCategoryFallback = filteredProductsResult.showingCategoryFallback;

  const categoryOptions = useMemo(() => {
    if (!selectedSupplier) return [] as string[];
    const ok = variant === 'user_suggestion' ? (p: Product) => p.inStock !== false : () => true;
    const keys = new Set<string>();
    for (const p of selectedSupplier.products) {
      if (!ok(p)) continue;
      const c = String(p.category ?? '').trim() || 'general';
      keys.add(c);
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [selectedSupplier, variant]);

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
    if (!selectedProduct || variant !== 'user_suggestion' || !suggestFn) return;
    setIsSubmittingUser(true);
    try {
      const storeRow = selectedProduct.supplier as StoreRow;
      const branchId = storeRow.branchId ?? storeRow.id;
      const label = selectedProduct.supplier.displayName || selectedProduct.supplier.name;
      const material: MaterialLine = {
        branchId,
        supplierId: branchId,
        supplierName: label,
        productId: selectedProduct.product.id,
        name: selectedProduct.product.name,
        qty: qtySuggest,
        unitPrice: selectedProduct.product.price,
        qualityTier: selectedProduct.product.qualityTier,
        unit: selectedProduct.product.unit,
        ...(selectedProduct.product.image && { imageUrl: selectedProduct.product.image }),
      };
      await suggestFn(material, message || 'I found this alternative — please consider it.');
      onBack();
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const getQualityColor = (tier: string) => {
    switch (tier) {
      case 'high':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100';
      case 'medium':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const headline =
    variant === 'provider_cart'
      ? view === 'stores'
        ? 'Choose a store branch'
        : storeTitle(selectedSupplier as StoreRow)
      : view === 'stores'
        ? 'Suggest alternative materials'
        : storeTitle(selectedSupplier as StoreRow);

  const subline =
    view === 'stores'
      ? variant === 'provider_cart'
        ? 'Branches are ranked near the job site — search anywhere to widen results.'
        : 'Pick an in-stock branch near the job. Your provider will review your suggestion.'
      : variant === 'provider_cart'
        ? 'Search and filter by category, then add items to send to your customer.'
        : 'Pick one product, set quantity and an optional note, then send.';

  return (
    <>
      <div className="relative mx-auto w-full max-w-5xl pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
      <header className="border-b border-border pb-4 space-y-1">
        <div className="flex items-start gap-2">
          {view === 'products' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 mt-0.5"
              onClick={() => {
                setView('stores');
                setSelectedSupplier(null);
                resetProductsUi();
              }}
              aria-label="Back to branches"
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

        {view === 'products' && selectedSupplier && (
          <div className="space-y-4 pb-4">
            {/* {showingCategoryFallback && (
              <p className="text-xs text-muted-foreground rounded-xl border bg-muted/30 px-4 py-3 leading-relaxed">
                No catalog entries match your job category exactly — showing this branch&apos;s full catalog. Items outside the job category
                will be flagged as extras when saved.
              </p>
            )} */}

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by product name or category…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 rounded-xl bg-muted/40 border-transparent"
                />
              </div>
              <div className="w-36 sm:w-52 shrink-0">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/40 border-transparent">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CATEGORIES_VALUE}>All categories</SelectItem>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredProducts.length === 0 && (
              <p className="text-center text-muted-foreground py-16 text-sm">
                {searchQuery.trim() || categoryFilter !== ALL_CATEGORIES_VALUE
                  ? 'Nothing matches — try adjusting search or category.'
                  : 'No products in this catalog.'}
              </p>
            )}

            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 lg:grid-cols-3">
              {filteredProducts.map((product) =>
                variant === 'provider_cart' ? (
                  <ProductRowCart
                    key={product.id}
                    product={product}
                    qty={getCartQty(product.id, selectedSupplier.id)}
                    getQualityColor={getQualityColor}
                    onAdd={() => handleAddToCart(product, selectedSupplier)}
                    onRemove={() => handleRemoveFromCart(product, selectedSupplier)}
                  />
                ) : (
                  <ProductRowSuggest
                    key={product.id}
                    product={product}
                    selected={selectedProduct?.product.id === product.id}
                    getQualityColor={getQualityColor}
                    onPick={() =>
                      setSelectedProduct({
                        product,
                        supplier: selectedSupplier,
                      })
                    }
                  />
                )
              )}
            </ul>

            {variant === 'user_suggestion' && selectedProduct && (
              <section className="rounded-xl border border-border bg-muted/20 p-4 space-y-4 mt-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected</p>
                    <p className="font-medium">{selectedProduct.product.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Qty</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => setQtySuggest((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-10 text-center font-medium">{qtySuggest}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => setQtySuggest((q) => q + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="browse-suggest-msg" className="text-muted-foreground">
                    Message to provider (optional)
                  </Label>
                  <Textarea
                    id="browse-suggest-msg"
                    placeholder="Why you’re suggesting this alternative…"
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
        {variant === 'provider_cart' && view === 'products' ? (
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
        ) : variant === 'provider_cart' ? (
          <div className="flex w-full justify-end sm:flex-initial">
            <Button type="button" variant="outline" onClick={onBack}>
              Cancel
            </Button>
          </div>
        ) : view === 'products' && selectedProduct ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSubmitSuggestion()} disabled={isSubmittingUser}>
              {isSubmittingUser ? 'Sending…' : 'Send suggestion'}
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

function ProductRowCart({
  product,
  qty,
  getQualityColor,
  onAdd,
  onRemove,
}: {
  product: Product;
  qty: number;
  getQualityColor: (t: string) => string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex h-full min-h-0 list-none">
      <div
        className={cn(
          'flex h-full min-h-[260px] w-full flex-col overflow-hidden rounded-xl border-2 bg-card shadow-sm ring-1 ring-border transition-[box-shadow,border-color]',
          qty > 0 ? 'border-primary ring-primary/25 shadow-md' : 'border-primary hover:border-primary'
        )}
      >
        <div className="relative aspect-square w-full shrink-0 bg-muted">
          {product.image ? (
            <img src={resolveUploadUrl(product.image)} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center p-3 text-center text-[10px] text-muted-foreground">No image</div>
          )}
          {product.special && (
            <Badge className="absolute right-2 top-2 gap-0.5 bg-accent px-2 text-[10px] text-accent-foreground shadow-sm">
              <Sparkles className="size-3" /> Deal
            </Badge>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="min-h-0 flex-1">
            <p className="text-sm font-medium leading-snug line-clamp-2">{product.name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={cn('text-[10px] font-normal', getQualityColor(product.qualityTier))}>
                {product.qualityTier}
              </Badge>
              <Badge variant="secondary" className="truncate text-[10px] font-normal">
                <span className="max-w-[7rem] truncate sm:max-w-[9rem]" title={product.category}>
                  {product.category}
                </span>
              </Badge>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border pt-3">
            <div className="min-w-0">
              <p className="text-sm font-bold tabular-nums leading-none">{formatCurrency(product.price, { decimals: 2 })}</p>
              <p className="text-[10px] text-muted-foreground">per {product.unit}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {qty > 0 ? (
                <>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={onRemove} aria-label="Remove one">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-xs font-semibold tabular-nums">{qty}</span>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={onAdd} aria-label="Add one">
                    <Plus className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" className="h-8 gap-1 px-3 text-xs" onClick={onAdd}>
                  <Plus className="size-4" /> Add
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function ProductRowSuggest({
  product,
  selected,
  getQualityColor,
  onPick,
}: {
  product: Product;
  selected: boolean;
  getQualityColor: (tier: string) => string;
  onPick: () => void;
}) {
  return (
    <li className="flex min-h-0 h-full list-none">
      <button
        type="button"
        className={cn(
          'flex h-full min-h-[260px] w-full flex-col overflow-hidden rounded-xl border-2 bg-card text-left shadow-sm ring-1 ring-border transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected ? 'border-primary ring-primary/30 shadow-md' : 'border-primary hover:border-primary'
        )}
        onClick={onPick}
      >
        <div className="relative aspect-square w-full shrink-0 bg-muted">
          {product.image ? (
            <img src={resolveUploadUrl(product.image)} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center p-3 text-center text-[10px] text-muted-foreground">No image</div>
          )}
          {selected && (
            <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
              Selected
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <p className="text-sm font-medium leading-snug line-clamp-2">{product.name}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn('text-[10px] font-normal', getQualityColor(product.qualityTier))}>
              {product.qualityTier}
            </Badge>
            <Badge variant="secondary" className="truncate text-[10px] font-normal">{product.category}</Badge>
          </div>
          <div className="mt-auto pt-3">
            <p className="text-sm font-semibold tabular-nums">{formatCurrency(product.price, { decimals: 2 })}</p>
            <p className="text-[10px] text-muted-foreground">/{product.unit}</p>
          </div>
        </div>
      </button>
    </li>
  );
}
