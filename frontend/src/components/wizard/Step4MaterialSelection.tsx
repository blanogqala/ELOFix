import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Supplier, Product, MaterialLine } from '@/types';
import { getSuppliers } from '@/lib/api/suppliers';
import { 
  ArrowLeft, 
  Plus, 
  Minus, 
  X, 
  Truck, 
  Star,
  Search,
  ShoppingCart,
  ChevronRight,
  Package
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step4MaterialSelectionProps {
  selectedCategory: string;
  materials: MaterialLine[];
  setMaterials: (materials: MaterialLine[]) => void;
}

type ViewMode = 'stores' | 'store-detail' | 'extra-search';

export function Step4MaterialSelection({
  selectedCategory,
  materials,
  setMaterials
}: Step4MaterialSelectionProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('stores');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'specials' | 'low' | 'medium' | 'high'>('specials');

  const loadSuppliers = useCallback(async () => {
    try {
      const allSuppliers = await getSuppliers();
      // Filter suppliers that have products in the selected category
      const relevantSuppliers = allSuppliers.filter(s => 
        s.products.some(p => p.category === selectedCategory && p.inStock)
      );
      setSuppliers(relevantSuppliers);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setViewMode('store-detail');
    setActiveTab('specials');
  };

  const handleAddMaterial = (product: Product, supplier: Supplier, isExtra: boolean = false) => {
    const existing = materials.find(m => m.productId === product.id);
    if (existing) {
      setMaterials(materials.map(m => 
        m.productId === product.id ? { ...m, qty: m.qty + 1 } : m
      ));
    } else {
      setMaterials([...materials, {
        supplierId: supplier.id,
        supplierName: supplier.name,
        productId: product.id,
        name: product.name,
        qty: 1,
        unitPrice: product.price,
        qualityTier: product.qualityTier,
        unit: product.unit,
        isExtra,
      }]);
    }
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setMaterials(materials.map(m => {
      if (m.productId === productId) {
        const newQty = Math.max(0, m.qty + delta);
        return { ...m, qty: newQty };
      }
      return m;
    }).filter(m => m.qty > 0));
  };

  const handleRemoveMaterial = (productId: string) => {
    setMaterials(materials.filter(m => m.productId !== productId));
  };

  const getCategoryProducts = (supplier: Supplier) => {
    return supplier.products.filter(p => p.category === selectedCategory && p.inStock);
  };

  const getSpecialsCount = (supplier: Supplier) => {
    return getCategoryProducts(supplier).filter(p => p.special).length;
  };

  const getAllProducts = () => {
    return suppliers.flatMap(s => 
      s.products.filter(p => p.inStock).map(p => ({ ...p, supplier: s }))
    );
  };

  const materialsTotal = materials.reduce((sum, m) => sum + (m.qty * m.unitPrice), 0);

  // Group materials by store
  const materialsByStore = materials.reduce((acc, m) => {
    if (!acc[m.supplierId]) {
      acc[m.supplierId] = { name: m.supplierName, items: [] };
    }
    acc[m.supplierId].items.push(m);
    return acc;
  }, {} as Record<string, { name: string; items: MaterialLine[] }>);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // STORES LIST VIEW
  if (viewMode === 'stores') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Select Materials</h2>
          <p className="text-muted-foreground">Choose a hardware store to browse materials</p>
        </div>

        {/* Store Cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          {suppliers.map(supplier => (
            <div
              key={supplier.id}
              onClick={() => handleSelectSupplier(supplier)}
              className="p-4 border border-border rounded-lg hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                  {supplier.logo || '🏪'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{supplier.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {getCategoryProducts(supplier).length} products available
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {supplier.hasDelivery && (
                      <Badge variant="secondary" className="text-xs">
                        <Truck className="h-3 w-3 mr-1" />
                        Delivery
                      </Badge>
                    )}
                    {getSpecialsCount(supplier) > 0 && (
                      <Badge className="bg-accent text-accent-foreground text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        {getSpecialsCount(supplier)} Specials
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </div>
          ))}
        </div>

        {/* Add Extra Materials Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setViewMode('extra-search')}
        >
          <Package className="h-4 w-4 mr-2" />
          Add Extra Materials (Outside Category)
        </Button>

        {/* Cart Summary */}
        {materials.length > 0 && (
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Your Materials
              </h3>
              <span className="text-lg font-bold">${materialsTotal.toFixed(2)}</span>
            </div>
            
            {Object.entries(materialsByStore).map(([storeId, store]) => (
              <div key={storeId} className="mb-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">{store.name}</p>
                <div className="space-y-2">
                  {store.items.map(m => (
                    <div key={m.productId} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.name}
                          {m.isExtra && (
                            <span className="ml-2 text-xs text-accent">(Extra)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ${m.unitPrice}/{m.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateQty(m.productId, -1);
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{m.qty}</span>
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateQty(m.productId, 1);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm font-medium w-16 text-right">
                        ${(m.qty * m.unitPrice).toFixed(2)}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMaterial(m.productId);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-muted-foreground">Store subtotal</span>
                    <span className="font-medium">
                      ${store.items.reduce((sum, m) => sum + m.qty * m.unitPrice, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // STORE DETAIL VIEW
  if (viewMode === 'store-detail' && selectedSupplier) {
    const products = getCategoryProducts(selectedSupplier);
    const specials = products.filter(p => p.special);
    const lowQuality = products.filter(p => p.qualityTier === 'low');
    const mediumQuality = products.filter(p => p.qualityTier === 'medium');
    const highQuality = products.filter(p => p.qualityTier === 'high');

    const getTabProducts = () => {
      switch (activeTab) {
        case 'specials': return specials;
        case 'low': return lowQuality;
        case 'medium': return mediumQuality;
        case 'high': return highQuality;
        default: return products;
      }
    };

    const tabs = [
      { id: 'specials' as const, label: 'Specials', count: specials.length },
      { id: 'low' as const, label: 'Low', count: lowQuality.length },
      { id: 'medium' as const, label: 'Medium', count: mediumQuality.length },
      { id: 'high' as const, label: 'High', count: highQuality.length },
    ];

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              setViewMode('stores');
              setSelectedSupplier(null);
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
              {selectedSupplier.logo || '🏪'}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{selectedSupplier.name}</h2>
              {selectedSupplier.hasDelivery && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" />
                  Delivery available (${selectedSupplier.deliveryFee})
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quality Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0",
                tab.id === 'specials' && activeTab === 'specials' && "bg-accent hover:bg-accent/90"
              )}
            >
              {tab.id === 'specials' && <Star className="h-3 w-3 mr-1" />}
              {tab.label}
              <span className="ml-1 text-xs opacity-70">({tab.count})</span>
            </Button>
          ))}
        </div>

        {/* Products List */}
        <div className="space-y-3">
          {getTabProducts().length > 0 ? (
            getTabProducts().map(product => {
              const inCart = materials.find(m => m.productId === product.id);
              return (
                <div 
                  key={product.id}
                  className={cn(
                    "flex items-center gap-4 p-4 border rounded-lg transition-colors",
                    inCart ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  )}
                >
                  {/* Product Image */}
                  <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {product.image ? (
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{product.name}</p>
                      {product.special && (
                        <Badge className="bg-accent text-accent-foreground text-xs">
                          Special
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ${product.price}/{product.unit} • {product.qualityTier} quality
                    </p>
                  </div>

                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8"
                        onClick={() => handleUpdateQty(product.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{inCart.qty}</span>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8"
                        onClick={() => handleUpdateQty(product.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      size="sm"
                      onClick={() => handleAddMaterial(product, selectedSupplier)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No products in this category
            </div>
          )}
        </div>

        {/* Cart Summary */}
        {materials.length > 0 && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">Cart Total</p>
                <p className="text-sm text-muted-foreground">
                  {materials.length} items from {Object.keys(materialsByStore).length} store(s)
                </p>
              </div>
              <p className="text-xl font-bold">${materialsTotal.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // EXTRA MATERIALS SEARCH VIEW
  if (viewMode === 'extra-search') {
    const allProducts = getAllProducts();
    const filteredProducts = searchQuery
      ? allProducts.filter(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : allProducts.filter(p => p.category !== selectedCategory);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              setViewMode('stores');
              setSearchQuery('');
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Add Extra Materials</h2>
            <p className="text-sm text-muted-foreground">
              Browse products from other categories
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Products */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredProducts.map(product => {
            const inCart = materials.find(m => m.productId === product.id);
            return (
              <div 
                key={product.id}
                className={cn(
                  "flex items-center gap-4 p-3 border rounded-lg transition-colors",
                  inCart ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.supplier.name} • ${product.price}/{product.unit} • {product.category}
                  </p>
                </div>
                {inCart ? (
                  <div className="flex items-center gap-1">
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-7 w-7"
                      onClick={() => handleUpdateQty(product.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{inCart.qty}</span>
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-7 w-7"
                      onClick={() => handleUpdateQty(product.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddMaterial(product, product.supplier, true)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
