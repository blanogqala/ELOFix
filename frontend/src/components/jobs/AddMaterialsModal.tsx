import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Supplier, Product, MaterialLine, JobLocation } from '@/types';
import { getStores, type StoreRow } from '@/lib/api/stores';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Store,
  Truck,
  Sparkles,
  MapPin,
  Loader2,
  Navigation,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { categoryKeysMatch } from '@/lib/categoryKey';
import { formatDistanceKm } from '@/lib/geo/haversine';

interface AddMaterialsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Customer / job site location — used to rank nearby store branches. */
  jobLocation?: JobLocation | null;
  jobCategory: string;
  existingMaterials: MaterialLine[];
  onAddMaterials: (materials: MaterialLine[]) => void;
}

export function AddMaterialsModal({
  open,
  onOpenChange,
  jobLocation,
  jobCategory,
  existingMaterials,
  onAddMaterials,
}: AddMaterialsModalProps) {
  const [view, setView] = useState<'stores' | 'products'>('stores');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [cart, setCart] = useState<Record<string, { product: Product; qty: number; supplier: Supplier }>>({});

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStoresLoading(true);
    void getStores({
      city: jobLocation?.city?.trim(),
      lat: jobLocation?.coordinates?.lat,
      lng: jobLocation?.coordinates?.lng,
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
  }, [open, jobLocation?.city, jobLocation?.coordinates?.lat, jobLocation?.coordinates?.lng, storeSearch]);

  // When modal opens: sync cart from saved job materials, or clear for a fresh add
  useEffect(() => {
    if (!open) return;
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
  }, [open, jobCategory, existingMaterials]);

  // Reset state when modal closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setView('stores');
      setSelectedSupplier(null);
      setSearchQuery('');
      setStoreSearch('');
      setStores([]);
      setCart({});
    }
    onOpenChange(isOpen);
  };

  const filteredProductsResult = useMemo(() => {
    if (!selectedSupplier) return { products: [] as Product[], showingCategoryFallback: false };
    const q = searchQuery.trim().toLowerCase();
    const bySearch = (p: Product) => !q || p.name.toLowerCase().includes(q);
    const byCat = (p: Product) => categoryKeysMatch(p.category, jobCategory);
    const strict = selectedSupplier.products.filter((p) => bySearch(p) && byCat(p));
    if (strict.length > 0) return { products: strict, showingCategoryFallback: false };
    if (!searchQuery.trim()) {
      return {
        products: selectedSupplier.products.filter((p) => p.inStock !== false),
        showingCategoryFallback: true,
      };
    }
    return {
      products: selectedSupplier.products.filter(bySearch),
      showingCategoryFallback: true,
    };
  }, [selectedSupplier, searchQuery, jobCategory]);

  const filteredProducts = filteredProductsResult.products;
  const showingCategoryFallback = filteredProductsResult.showingCategoryFallback;

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setView('products');
    setSearchQuery('');
  };

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

  const getCartQty = (productId: string, supplierId: string) => {
    return cart[`${supplierId}-${productId}`]?.qty || 0;
  };

  const cartTotal = Object.values(cart).reduce((sum, item) => sum + item.product.price * item.qty, 0);

  const cartItemCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);

  const handleSaveToJob = () => {
    const newMaterials: MaterialLine[] = Object.values(cart).map((item) => {
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

    onAddMaterials(newMaterials);
    handleOpenChange(false);
  };

  const getQualityColor = (tier: string) => {
    switch (tier) {
      case 'high':
        return 'bg-amber-100 text-amber-800';
      case 'medium':
        return 'bg-blue-100 text-blue-800';
      case 'low':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const storeTitle = (s: StoreRow) => s.displayName || s.name;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === 'products' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setView('stores');
                  setSelectedSupplier(null);
                  setSearchQuery('');
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {view === 'stores' ? 'Select store branch' : storeTitle(selectedSupplier as StoreRow)}
          </DialogTitle>
          <DialogDescription>
            {view === 'stores'
              ? 'Choose a branch near the job site — products are loaded from that branch only.'
              : 'Add materials to your job'}
          </DialogDescription>
        </DialogHeader>

        {/* Store Selection View */}
        {view === 'stores' && (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stores…"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              {storesLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading stores…
                </div>
              )}
              {!storesLoading &&
                stores.map((supplier) => (
                  <div
                    key={supplier.id}
                    onClick={() => handleSelectSupplier(supplier)}
                    className="flex items-center gap-4 p-4 border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Store className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{storeTitle(supplier)}</p>
                      {supplier.address?.trim() && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="break-words">{supplier.address.trim()}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        {typeof supplier.distanceKm === 'number' && Number.isFinite(supplier.distanceKm) && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                            <Navigation className="h-3 w-3" />
                            {formatDistanceKm(supplier.distanceKm)}
                          </span>
                        )}
                        {supplier.hasDelivery && (
                          <Badge variant="secondary" className="text-xs">
                            <Truck className="h-3 w-3 mr-1" />
                            Delivery
                          </Badge>
                        )}
                        {supplier.products.some((p) => p.special) && (
                          <Badge className="bg-accent text-accent-foreground text-xs">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Specials
                          </Badge>
                        )}
                        <span>{supplier.products.length} products</span>
                      </div>
                    </div>
                  </div>
                ))}
              {!storesLoading && stores.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No stores found for this search or area.</p>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Products View */}
        {view === 'products' && selectedSupplier && (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {showingCategoryFallback && (
              <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2">
                No exact category match — showing this store&apos;s full catalog. Extra items are marked when saved.
              </p>
            )}

            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-3">
                {filteredProducts.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    {searchQuery.trim() ? 'No products match your search.' : 'No products in this catalog.'}
                  </p>
                )}

                {filteredProducts.map((product) => {
                  const qty = getCartQty(product.id, selectedSupplier.id);
                  return (
                    <div
                      key={product.id}
                      className={cn(
                        'flex items-center gap-4 p-4 border rounded-lg transition-colors',
                        qty > 0 ? 'border-primary bg-primary/5' : 'border-border'
                      )}
                    >
                      <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="h-full w-full object-cover rounded-lg" />
                        ) : (
                          <span className="text-xs text-muted-foreground">No img</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{product.name}</p>
                          {product.special && (
                            <Badge className="bg-accent text-accent-foreground text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              Special
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={cn('text-xs', getQualityColor(product.qualityTier))}>
                            {product.qualityTier}
                          </Badge>
                          <span className="text-sm text-muted-foreground">per {product.unit}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">${product.price.toFixed(2)}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {qty > 0 ? (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => handleRemoveFromCart(product, selectedSupplier)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center font-medium">{qty}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => handleAddToCart(product, selectedSupplier)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => handleAddToCart(product, selectedSupplier)}>
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="border-t border-border pt-4 gap-2 sm:gap-0">
          {cartItemCount > 0 && (
            <div className="flex items-center gap-2 mr-auto">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {cartItemCount} items · <span className="font-bold">{formatCurrency(cartTotal, { decimals: 2 })}</span>
              </span>
            </div>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveToJob} disabled={cartItemCount === 0}>
            Save to Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
