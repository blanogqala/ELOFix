import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { getSuppliers } from '@/lib/api/suppliers';
import { getSavedCards } from '@/lib/api/payments';
import { createMaterialOrder } from '@/lib/api/materialOrders';
import { Supplier, Product, SavedCard, DeliveryProvider } from '@/types';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Store,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Truck,
  CreditCard,
  Check,
  Lock,
  AlertCircle,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getDeliveryProviders } from '@/lib/api/specials';

interface CartItem {
  product: Product;
  supplierId: string;
  supplierName: string;
  qty: number;
}

export default function OrderMaterials() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryType, setDeliveryType] = useState<'SELF' | 'STORE_DELIVERY' | 'DELIVERY_PROVIDER'>('SELF');
  const [selectedDeliveryProvider, setSelectedDeliveryProvider] = useState('');
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProvider[]>([]);
  const [deliveryProvidersError, setDeliveryProvidersError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [cvc, setCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeSearch, setStoreSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [sups, cards] = await Promise.all([
        getSuppliers(),
        user ? getSavedCards(user.id) : Promise.resolve([]),
      ]);
      setSuppliers(sups);
      setSavedCards(cards);
      const def = cards.find(c => c.isDefault) || cards[0];
      if (def) setSelectedCardId(def.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load stores or payment cards.');
    }
    try {
      setDeliveryProvidersError(null);
      const providers = await getDeliveryProviders();
      setDeliveryProviders(providers);
    } catch (error) {
      setDeliveryProviders([]);
      setDeliveryProvidersError(error instanceof Error ? error.message : 'Delivery providers are unavailable.');
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (deliveryProviders.length === 0) {
      setDeliveryType(prev => (prev === 'DELIVERY_PROVIDER' ? 'SELF' : prev));
      setSelectedDeliveryProvider('');
    }
  }, [deliveryProviders.length]);

  const filteredStores = suppliers.filter(s =>
    s.name.toLowerCase().includes(storeSearch.toLowerCase())
  );

  const filteredProducts = selectedSupplier?.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCat && p.inStock;
  }) || [];

  const productCategories = selectedSupplier
    ? [...new Set(selectedSupplier.products.map(p => p.category))]
    : [];

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) {
        return prev.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { product, supplierId: selectedSupplier!.id, supplierName: selectedSupplier!.name, qty: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.product.id === productId) {
        const newQty = c.qty + delta;
        return newQty > 0 ? { ...c, qty: newQty } : c;
      }
      return c;
    }).filter(c => c.qty > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  };

  const subtotal = cart.reduce((sum, c) => sum + c.product.price * c.qty, 0);
  const deliveryFee = deliveryType === 'STORE_DELIVERY'
    ? (selectedSupplier?.deliveryFee || 0)
    : deliveryType === 'DELIVERY_PROVIDER'
      ? (deliveryProviders.find(d => d.id === selectedDeliveryProvider)?.baseRate || 0)
      : 0;
  // Materials payment only; delivery fee paid later when approved (Store/Provider)
  const materialsTotal = subtotal;
  const total = materialsTotal;

  const handlePay = async () => {
    if (!user || !selectedSupplier) return;
    if (!selectedCardId) { setError('Select a card'); return; }
    if (!/^\d{3,4}$/.test(cvc)) { setError('Enter valid CVC (3-4 digits)'); return; }

    setIsProcessing(true);
    setError(null);
    try {
      const card = savedCards.find(c => c.id === selectedCardId);
      const deliveryTypeMap = deliveryType === 'SELF' ? 'SELF' : deliveryType === 'STORE_DELIVERY' ? 'STORE' : 'PROVIDER';
      const deliveryStatus = deliveryType === 'SELF' ? 'SelfCollect' as const : 'PendingApproval' as const;
      const order = await createMaterialOrder({
        userId: user.id,
        storeId: selectedSupplier.id,
        storeName: selectedSupplier.name,
        items: cart.map(c => ({
          productId: c.product.id,
          name: c.product.name,
          qty: c.qty,
          unitPrice: c.product.price,
          qualityTier: c.product.qualityTier,
        })),
        delivery: {
          type: deliveryTypeMap,
          status: deliveryStatus,
          providerId: deliveryType === 'DELIVERY_PROVIDER' ? selectedDeliveryProvider : undefined,
          fee: deliveryFee,
        },
        materialsTotal,
        cardLast4: card?.last4 || '****',
      });
      toast({ title: 'Order Placed!', description: 'Materials paid. You can pay for delivery once it\'s approved.' });
      navigate('/user/orders/' + order.id);
    } catch {
      setError('Payment failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl animate-fade-in">
        {/* Header */}
        <div className="mb-6 flex min-w-0 items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => step > 1 ? setStep(step - 1) : navigate('/user/new-request')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Order Materials</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Step {step} of 4</p>
          </div>
        </div>

        <div className="card-elevated overflow-hidden p-4 sm:p-6 md:p-8">
          {/* Step 1: Choose Store */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Choose a Store</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search stores..." value={storeSearch} onChange={e => setStoreSearch(e.target.value)} className="pl-10" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {filteredStores.map(sup => (
                  <div
                    key={sup.id}
                    onClick={() => { setSelectedSupplier(sup); setStep(2); }}
                    className={cn("card-elevated cursor-pointer p-4 transition-all hover:border-primary/30 sm:p-5",
                      selectedSupplier?.id === sup.id && "border-primary"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl">
                        {sup.logo || <Store className="h-5 w-5 text-primary sm:h-6 sm:w-6" />}
                      </div>
                      <div>
                        <p className="font-semibold">{sup.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sup.products.length} products • {sup.hasDelivery ? 'Delivers' : 'Pickup only'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Browse & Add to Cart */}
          {step === 2 && selectedSupplier && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{selectedSupplier.name}</h2>
                {cart.length > 0 && (
                  <Badge className="bg-accent text-accent-foreground">
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    {cart.reduce((s, c) => s + c.qty, 0)} items
                  </Badge>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant={categoryFilter === 'all' ? 'default' : 'outline'} onClick={() => setCategoryFilter('all')}>All</Button>
                  {productCategories.map(cat => (
                    <Button key={cat} size="sm" variant={categoryFilter === cat ? 'default' : 'outline'} onClick={() => setCategoryFilter(cat)} className="capitalize">
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {filteredProducts.map(product => {
                  const inCart = cart.find(c => c.product.id === product.id);
                  return (
                    <div key={product.id} className="p-4 border border-border rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{product.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-bold">{formatCurrency(product.price)}</span>
                            <span className="text-xs text-muted-foreground">/{product.unit}</span>
                            <Badge variant="secondary" className="text-xs capitalize">{product.qualityTier}</Badge>
                            {product.special && <Badge className="bg-accent text-accent-foreground text-xs">Special</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        {inCart ? (
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(product.id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center font-medium">{inCart.qty}</span>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(product.id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(product.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => addToCart(product)}>
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {cart.length > 0 && (
                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <p className="font-medium">Subtotal: <span className="text-primary">{formatCurrency(subtotal, { decimals: 2 })}</span></p>
                  <Button className="btn-accent" onClick={() => setStep(3)}>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Delivery Choice */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Delivery Options</h2>
              <RadioGroup
                value={deliveryType}
                onValueChange={(value) => {
                  if (value === 'SELF' || value === 'STORE_DELIVERY' || value === 'DELIVERY_PROVIDER') {
                    setDeliveryType(value);
                  }
                }}
              >
                <div className={cn("p-4 border rounded-lg", deliveryType === 'SELF' && "border-primary bg-primary/5")}>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="SELF" id="self" />
                    <Label htmlFor="self" className="cursor-pointer flex-1">
                      <p className="font-medium">I will collect myself</p>
                      <p className="text-sm text-muted-foreground">Free - Pick up from {selectedSupplier?.name}</p>
                    </Label>
                  </div>
                </div>

                {selectedSupplier?.hasDelivery && (
                  <div className={cn("p-4 border rounded-lg", deliveryType === 'STORE_DELIVERY' && "border-primary bg-primary/5")}>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="STORE_DELIVERY" id="store-del" />
                      <Label htmlFor="store-del" className="cursor-pointer flex-1">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">Store Delivery</p>
                            <p className="text-sm text-muted-foreground">Delivered by {selectedSupplier.name}</p>
                          </div>
                          <p className="font-medium">{formatCurrency(selectedSupplier.deliveryFee)}</p>
                        </div>
                      </Label>
                    </div>
                  </div>
                )}

                {deliveryProviders.length > 0 && (
                  <div className={cn("p-4 border rounded-lg", deliveryType === 'DELIVERY_PROVIDER' && "border-primary bg-primary/5")}>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="DELIVERY_PROVIDER" id="del-prov" />
                      <Label htmlFor="del-prov" className="cursor-pointer flex-1">
                        <p className="font-medium">Request Delivery Van</p>
                        <p className="text-sm text-muted-foreground">Choose from available delivery providers</p>
                      </Label>
                    </div>
                  </div>
                )}
              </RadioGroup>

              {deliveryProviders.length > 0 && deliveryType === 'DELIVERY_PROVIDER' && (
                <div className="space-y-3">
                  <Label>Select a Delivery Provider</Label>
                  {deliveryProviders.map(dp => (
                    <div
                      key={dp.id}
                      onClick={() => setSelectedDeliveryProvider(dp.id)}
                      className={cn("p-4 border rounded-lg cursor-pointer transition-colors",
                        selectedDeliveryProvider === dp.id ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <Truck className="h-5 w-5 text-primary" />
                          <div>
                            <p className="font-medium">{dp.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[dp.vehicleType, dp.rating != null && `★ ${dp.rating}`, `ETA: ${dp.estimatedTime}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        <p className="font-bold">${dp.baseRate}</p>
                      </div>
                    </div>
                  ))}
                  {deliveryProvidersError && (
                    <p className="text-xs text-destructive">{deliveryProvidersError}</p>
                  )}
                  {!deliveryProvidersError && deliveryProviders.length === 0 && (
                    <p className="text-xs text-muted-foreground">No delivery providers available.</p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-border">
                <Button className="btn-accent" onClick={() => setStep(4)}
                  disabled={
                    deliveryType === 'DELIVERY_PROVIDER' &&
                    (!selectedDeliveryProvider || deliveryProviders.length === 0)
                  }
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {deliveryType !== 'SELF' && 'Materials will be charged now. Delivery fee is paid after approval.'}
              </p>
            </div>
          )}

          {/* Step 4: Summary + Payment */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Order Summary & Payment</h2>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="font-medium mb-2">{selectedSupplier?.name}</p>
                {cart.map(c => (
                  <div key={c.product.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{c.product.name} × {c.qty}</span>
                    <span>{formatCurrency(c.product.price * c.qty, { decimals: 2 })}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Materials</span>
                    <span>{formatCurrency(subtotal, { decimals: 2 })}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Delivery (pay after approval)</span>
                      <span>${deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
                    <span>Pay now</span>
                    <span className="text-primary">{formatCurrency(total, { decimals: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Card Selection */}
              <div>
                <Label className="mb-2 block">Payment Method</Label>
                <RadioGroup value={selectedCardId} onValueChange={setSelectedCardId}>
                  {savedCards.map(card => (
                    <div key={card.id} className={cn("flex items-center space-x-3 p-3 border rounded-lg", selectedCardId === card.id ? "border-primary bg-primary/5" : "border-border")}>
                      <RadioGroupItem value={card.id} id={`oc-${card.id}`} />
                      <Label htmlFor={`oc-${card.id}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          <span className="capitalize">{card.brand}</span>
                          <span>•••• {card.last4}</span>
                          {card.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div>
                <Label htmlFor="order-cvc" className="mb-2 block">CVC</Label>
                <Input id="order-cvc" type="text" inputMode="numeric" maxLength={4} placeholder="123" value={cvc}
                  onChange={e => setCvc(e.target.value.replace(/\D/g, ''))} className="max-w-[120px]" />
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}

              <Button className="btn-accent w-full" onClick={handlePay} disabled={isProcessing}>
                <Lock className="h-4 w-4 mr-2" />
                {isProcessing ? 'Processing...' : `Pay materials ${formatCurrency(total, { decimals: 2 })}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
