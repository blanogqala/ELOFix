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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Supplier, Product, MaterialLine, JobLocation } from '@/types';
import { getStores, type StoreRow } from '@/lib/api/stores';
import { ArrowLeft, Plus, Minus, Lightbulb, Search, MapPin, Loader2, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoryKeysMatch } from '@/lib/categoryKey';
import { formatDistanceKm } from '@/lib/geo/haversine';

interface SuggestAlternativeMaterialsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobLocation?: JobLocation | null;
  jobCategory: string;
  onSuggest: (suggested: MaterialLine, message: string, originalProductId?: string) => Promise<void>;
}

export function SuggestAlternativeMaterialsModal({
  open,
  onOpenChange,
  jobLocation,
  jobCategory,
  onSuggest,
}: SuggestAlternativeMaterialsModalProps) {
  const [view, setView] = useState<'stores' | 'products'>('stores');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ product: Product; supplier: Supplier } | null>(null);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setView('stores');
      setSelectedSupplier(null);
      setSearchQuery('');
      setStoreSearch('');
      setStores([]);
      setSelectedProduct(null);
      setQty(1);
      setMessage('');
    }
    onOpenChange(isOpen);
  };

  const filteredProductsResult = useMemo(() => {
    if (!selectedSupplier) return { products: [] as Product[], showingCategoryFallback: false };
    const q = searchQuery.trim().toLowerCase();
    const bySearch = (p: Product) => !q || p.name.toLowerCase().includes(q);
    const byCat = (p: Product) => categoryKeysMatch(p.category, jobCategory);
    const strict = selectedSupplier.products.filter((p) => bySearch(p) && byCat(p) && p.inStock);
    if (strict.length > 0) return { products: strict, showingCategoryFallback: false };
    if (!searchQuery.trim()) {
      return {
        products: selectedSupplier.products.filter((p) => p.inStock !== false),
        showingCategoryFallback: true,
      };
    }
    return {
      products: selectedSupplier.products.filter((p) => bySearch(p) && p.inStock !== false),
      showingCategoryFallback: true,
    };
  }, [selectedSupplier, searchQuery, jobCategory]);

  const filteredProducts = filteredProductsResult.products;
  const showingCategoryFallback = filteredProductsResult.showingCategoryFallback;

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setView('products');
    setSearchQuery('');
    setSelectedProduct(null);
  };

  const handleSubmitSuggestion = async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      const label = selectedProduct.supplier.displayName || selectedProduct.supplier.name;
      const material: MaterialLine = {
        supplierId: selectedProduct.supplier.id,
        supplierName: label,
        productId: selectedProduct.product.id,
        name: selectedProduct.product.name,
        qty,
        unitPrice: selectedProduct.product.price,
        qualityTier: selectedProduct.product.qualityTier,
        unit: selectedProduct.product.unit,
      };
      await onSuggest(material, message || 'I found this alternative - please consider it.');
      handleOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getQualityColor = (tier: string) => {
    switch (tier) {
      case 'high':
        return 'bg-amber-100 text-amber-800';
      case 'medium':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const storeTitle = (s: StoreRow) => s.displayName || s.name;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-accent" />
            Suggest Alternative Materials
          </DialogTitle>
          <DialogDescription>
            Pick a store branch near the job, then choose an in-stock product. Your provider will review the suggestion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {view === 'stores' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search store or brand…"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <ScrollArea className="h-64">
                <div className="space-y-2 pr-4">
                  {storesLoading && (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading stores…
                    </div>
                  )}
                  {!storesLoading &&
                    stores.map((supplier) => (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => handleSelectSupplier(supplier)}
                        className={cn(
                          'w-full flex items-center gap-3 p-4 rounded-lg border text-left transition-colors',
                          'hover:border-primary/50 hover:bg-primary/5'
                        )}
                      >
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-lg">
                          {supplier.logo || '🏪'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{storeTitle(supplier)}</p>
                          {supplier.address?.trim() && (
                            <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="break-words">{supplier.address.trim()}</span>
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {typeof supplier.distanceKm === 'number' && Number.isFinite(supplier.distanceKm) && (
                              <span className="inline-flex items-center gap-1">
                                <Navigation className="h-3 w-3" />
                                {formatDistanceKm(supplier.distanceKm)}
                              </span>
                            )}
                            <span>
                              {supplier.products.filter((p) => categoryKeysMatch(p.category, jobCategory) && p.inStock)
                                .length ||
                                supplier.products.filter((p) => p.inStock).length}{' '}
                              products
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  {!storesLoading && stores.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">No stores in this area.</p>
                  )}
                </div>
              </ScrollArea>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </div>
          ) : (
            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setView('stores');
                  setSelectedSupplier(null);
                  setSelectedProduct(null);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> {storeTitle(selectedSupplier as StoreRow)}
              </Button>

              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field"
              />
              {showingCategoryFallback && (
                <p className="text-xs text-muted-foreground">Showing full in-stock catalog — no exact category match.</p>
              )}

              <ScrollArea className="flex-1 min-h-[200px]">
                <div className="space-y-2 pr-4">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className={cn(
                        'p-4 rounded-lg border cursor-pointer transition-colors',
                        selectedProduct?.product.id === product.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/30'
                      )}
                      onClick={() => setSelectedProduct({ product, supplier: selectedSupplier! })}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={cn('text-xs', getQualityColor(product.qualityTier))}>
                              {product.qualityTier}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              ${product.price}/{product.unit}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No products found</p>
                  )}
                </div>
              </ScrollArea>

              {selectedProduct && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Selected: {selectedProduct.product.name}</p>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => setQty(Math.max(1, qty - 1))}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center">{qty}</span>
                      <Button size="icon" variant="outline" onClick={() => setQty(qty + 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="suggest-message">Message to provider (optional)</Label>
                    <Textarea
                      id="suggest-message"
                      placeholder="Why you're suggesting this alternative..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="mt-2"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedProduct && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitSuggestion} disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Suggestion'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
