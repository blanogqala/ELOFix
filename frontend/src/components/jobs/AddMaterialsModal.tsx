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
import { Supplier, Product, MaterialLine } from '@/types';
import { 
  ArrowLeft, 
  Search, 
  Plus, 
  Minus, 
  ShoppingCart,
  Store,
  Truck,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';

interface AddMaterialsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  jobCategory: string;
  existingMaterials: MaterialLine[];
  onAddMaterials: (materials: MaterialLine[]) => void;
}

export function AddMaterialsModal({
  open,
  onOpenChange,
  suppliers,
  jobCategory,
  existingMaterials,
  onAddMaterials,
}: AddMaterialsModalProps) {
  const [view, setView] = useState<'stores' | 'products'>('stores');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Record<string, { product: Product; qty: number; supplier: Supplier }>>({});

  // When modal opens: sync cart from saved job materials, or clear for a fresh add
  useEffect(() => {
    if (!open) return;
    if (existingMaterials.length > 0) {
      const initialCart: Record<string, { product: Product; qty: number; supplier: Supplier }> = {};
      for (const mat of existingMaterials) {
        const supplier = suppliers.find(s => s.id === mat.supplierId) ?? {
          id: mat.supplierId,
          name: mat.supplierName,
          hasDelivery: false,
          products: [],
        } as Supplier;
        const product = supplier.products?.find((p: Product) => p.id === mat.productId);
        const syntheticProduct: Product = product ?? {
          id: mat.productId,
          name: mat.name,
          category: jobCategory,
          price: mat.unitPrice,
          qualityTier: mat.qualityTier,
          unit: mat.unit || 'unit',
          inStock: true,
          image: (mat as MaterialLine & { imageUrl?: string }).imageUrl,
        };
        const key = `${mat.supplierId}-${mat.productId}`;
        initialCart[key] = { product: syntheticProduct, qty: mat.qty, supplier };
      }
      setCart(initialCart);
    } else {
      setCart({});
    }
  }, [open, suppliers, jobCategory, existingMaterials]);

  // Reset state when modal closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setView('stores');
      setSelectedSupplier(null);
      setSearchQuery('');
      setCart({});
    }
    onOpenChange(isOpen);
  };

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    if (!selectedSupplier) return [];
    
    return selectedSupplier.products.filter(p => {
      const matchesSearch = !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = p.category.toLowerCase() === jobCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    });
  }, [selectedSupplier, searchQuery, jobCategory]);

  // All products for extra search
  const allProducts = useMemo(() => {
    if (!searchQuery) return [];
    
    return suppliers.flatMap(supplier => 
      supplier.products
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(p => ({ product: p, supplier }))
    );
  }, [suppliers, searchQuery]);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setView('products');
    setSearchQuery('');
  };

  const handleAddToCart = (product: Product, supplier: Supplier) => {
    const key = `${supplier.id}-${product.id}`;
    setCart(prev => ({
      ...prev,
      [key]: {
        product,
        qty: (prev[key]?.qty || 0) + 1,
        supplier,
      }
    }));
  };

  const handleRemoveFromCart = (product: Product, supplier: Supplier) => {
    const key = `${supplier.id}-${product.id}`;
    setCart(prev => {
      const current = prev[key];
      if (!current || current.qty <= 1) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [key]: { ...current, qty: current.qty - 1 }
      };
    });
  };

  const getCartQty = (productId: string, supplierId: string) => {
    return cart[`${supplierId}-${productId}`]?.qty || 0;
  };

  const cartTotal = Object.values(cart).reduce(
    (sum, item) => sum + item.product.price * item.qty, 
    0
  );

  const cartItemCount = Object.values(cart).reduce(
    (sum, item) => sum + item.qty, 
    0
  );

  const handleSaveToJob = () => {
    const newMaterials: MaterialLine[] = Object.values(cart).map(item => ({
      supplierId: item.supplier.id,
      supplierName: item.supplier.name,
      productId: item.product.id,
      name: item.product.name,
      qty: item.qty,
      unitPrice: item.product.price,
      qualityTier: item.product.qualityTier,
      unit: item.product.unit,
      isExtra: item.product.category?.toLowerCase() !== jobCategory.toLowerCase(),
      ...(item.product.image && { imageUrl: item.product.image }),
    }));

    onAddMaterials(newMaterials);
    handleOpenChange(false);
  };

  const getQualityColor = (tier: string) => {
    switch (tier) {
      case 'high': return 'bg-amber-100 text-amber-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

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
            {view === 'stores' ? 'Select Store' : selectedSupplier?.name}
          </DialogTitle>
          <DialogDescription>
            {view === 'stores' 
              ? 'Choose a hardware store to browse products'
              : 'Add materials to your job'}
          </DialogDescription>
        </DialogHeader>

        {/* Store Selection View */}
        {view === 'stores' && (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3">
              {suppliers.map(supplier => (
                <div
                  key={supplier.id}
                  onClick={() => handleSelectSupplier(supplier)}
                  className="flex items-center gap-4 p-4 border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Store className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{supplier.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {supplier.products.length} products
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {supplier.hasDelivery && (
                      <Badge variant="secondary" className="text-xs">
                        <Truck className="h-3 w-3 mr-1" />
                        Delivery
                      </Badge>
                    )}
                    {supplier.products.some(p => p.special) && (
                      <Badge className="bg-accent text-accent-foreground text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Specials
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
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

            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-3">
                {filteredProducts.length === 0 && !searchQuery && (
                  <p className="text-center text-muted-foreground py-8">
                    No products found for this category
                  </p>
                )}

                {filteredProducts.map(product => {
                  const qty = getCartQty(product.id, selectedSupplier.id);
                  return (
                    <div
                      key={product.id}
                      className={cn(
                        "flex items-center gap-4 p-4 border rounded-lg transition-colors",
                        qty > 0 ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {product.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="h-full w-full object-cover rounded-lg"
                          />
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
                          <Badge variant="outline" className={cn("text-xs", getQualityColor(product.qualityTier))}>
                            {product.qualityTier}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            per {product.unit}
                          </span>
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
                            <Button
                              size="sm"
                              onClick={() => handleAddToCart(product, selectedSupplier)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Show extra products from search across all stores */}
                {searchQuery && allProducts.length > 0 && (
                  <>
                    <div className="py-2 border-t border-border mt-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        Products from other stores
                      </p>
                    </div>
                    {allProducts
                      .filter(({ product, supplier }) => supplier.id !== selectedSupplier.id)
                      .map(({ product, supplier }) => {
                        const qty = getCartQty(product.id, supplier.id);
                        return (
                          <div
                            key={`${supplier.id}-${product.id}`}
                            className={cn(
                              "flex items-center gap-4 p-4 border rounded-lg transition-colors",
                              qty > 0 ? "border-primary bg-primary/5" : "border-border border-dashed"
                            )}
                          >
                            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              {product.image ? (
                                <img 
                                  src={product.image} 
                                  alt={product.name}
                                  className="h-full w-full object-cover rounded-lg"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">No img</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium truncate">{product.name}</p>
                                <Badge variant="outline" className="text-xs">
                                  {supplier.name}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={cn("text-xs", getQualityColor(product.qualityTier))}>
                                  {product.qualityTier}
                                </Badge>
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
                                      onClick={() => handleRemoveFromCart(product, supplier)}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-8 text-center font-medium">{qty}</span>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-8 w-8"
                                      onClick={() => handleAddToCart(product, supplier)}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAddToCart(product, supplier)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </>
                )}
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
          <Button 
            onClick={handleSaveToJob}
            disabled={cartItemCount === 0}
          >
            Save to Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
