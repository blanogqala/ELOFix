import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { getBranchesNearby, type StoreRow } from '@/lib/api/stores';
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
  Lock,
  AlertCircle,
  Package,
  MapPin,
  Loader2,
  Navigation,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getDeliveryProviders } from '@/lib/api/specials';
import { reverseGeocode } from '@/lib/api/geocode';
import { haversineKm, formatDistanceKm } from '@/lib/geo/haversine';
import { readCachedUserCoords, writeCachedUserCoords } from '@/lib/geo/sessionUserLocation';

interface CartItem {
  product: Product;
  supplierId: string;
  supplierName: string;
  qty: number;
}

function sortStoresByDistance(
  list: StoreRow[],
  userCoords: { lat: number; lng: number } | null
): StoreRow[] {
  const distKm = (s: StoreRow): number | null => {
    if (typeof s.distanceKm === 'number' && Number.isFinite(s.distanceKm)) {
      return s.distanceKm;
    }
    if (
      !userCoords ||
      typeof s.latitude !== 'number' ||
      typeof s.longitude !== 'number' ||
      !Number.isFinite(s.latitude) ||
      !Number.isFinite(s.longitude)
    ) {
      return null;
    }
    return haversineKm(userCoords.lat, userCoords.lng, s.latitude, s.longitude);
  };

  return [...list].sort((a, b) => {
    const dA = distKm(a);
    const dB = distKm(b);

    if (dA != null && dB != null && dA !== dB) return dA - dB;
    if (dA != null && dB == null) return -1;
    if (dA == null && dB != null) return 1;
    return String(a.displayName || a.name).localeCompare(String(b.displayName || b.name));
  });
}

function geolocationMessage(code?: number): string {
  switch (code) {
    case 1:
      return 'Location permission was denied. Enable it in your browser settings or enter your address manually.';
    case 2:
      return 'Your position could not be determined. Try again or enter your address manually.';
    case 3:
      return 'Location request timed out. Try again or enter your address manually.';
    default:
      return 'Could not access your location. Enter your address manually.';
  }
}

export default function OrderMaterials() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
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
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeSearch, setStoreSearch] = useState('');
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const geocodeCacheRef = useRef<Map<string, Awaited<ReturnType<typeof reverseGeocode>>>>(new Map());

  const loadData = useCallback(async () => {
    try {
      const cards = user ? await getSavedCards(user.id) : [];
      setSavedCards(cards);
      const def = cards.find(c => c.isDefault) || cards[0];
      if (def) setSelectedCardId(def.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load payment cards.');
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadStores = useCallback(async () => {
    setStoresLoading(true);
    try {
      setError(null);
      const list = await getBranchesNearby({
        city: deliveryCity.trim() || undefined,
        lat: userGeo?.lat,
        lng: userGeo?.lng,
        q: storeSearch.trim() || undefined,
      });
      setStores(list);
    } catch (err) {
      setStores([]);
      setError(err instanceof Error ? err.message : 'Failed to load stores.');
    } finally {
      setStoresLoading(false);
    }
  }, [deliveryCity, userGeo, storeSearch]);

  useEffect(() => {
    if (step !== 1) return;
    const t = window.setTimeout(() => {
      void loadStores();
    }, 250);
    return () => window.clearTimeout(t);
  }, [step, loadStores]);

  useEffect(() => {
    const cached = readCachedUserCoords();
    if (cached) setUserGeo({ lat: cached.lat, lng: cached.lng });
  }, []);

  useEffect(() => {
    if (deliveryProviders.length === 0) {
      setDeliveryType(prev => (prev === 'DELIVERY_PROVIDER' ? 'SELF' : prev));
      setSelectedDeliveryProvider('');
    }
  }, [deliveryProviders.length]);

  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    void (async () => {
      try {
        setDeliveryProvidersError(null);
        const providers = await getDeliveryProviders({
          city: deliveryCity.trim() || undefined,
          lat: userGeo?.lat,
          lng: userGeo?.lng,
        });
        if (!cancelled) setDeliveryProviders(providers);
      } catch (e) {
        if (!cancelled) {
          setDeliveryProviders([]);
          setDeliveryProvidersError(e instanceof Error ? e.message : 'Delivery providers are unavailable.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, deliveryCity, userGeo?.lat, userGeo?.lng]);

  const sortedStoresStep1 = useMemo(
    () => sortStoresByDistance(stores, userGeo),
    [stores, userGeo]
  );

  const applyCoordsAndFillAddress = useCallback(
    async (lat: number, lng: number) => {
      setUserGeo({ lat, lng });
      writeCachedUserCoords(lat, lng);
      const cacheKey = `${lat.toFixed(5)}_${lng.toFixed(5)}`;
      let geo = geocodeCacheRef.current.get(cacheKey);
      if (!geo) {
        geo = await reverseGeocode(lat, lng);
        geocodeCacheRef.current.set(cacheKey, geo);
      }
      const street = (geo.street || '').trim();
      const line1 = street || (geo.address || '').split(',')[0]?.trim() || '';
      setDeliveryAddress(line1);
      setDeliveryCity((geo.city || '').trim());
      const area = (geo.area || geo.suburb || '').trim();
      setDeliveryArea(area);
    },
    []
  );

  const handleUseMyLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Location not supported',
        description: 'Your browser does not support geolocation.',
        variant: 'destructive',
      });
      return;
    }
    setLocationLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 120000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        await applyCoordsAndFillAddress(lat, lng);
        toast({
          title: 'Address updated',
          description: 'Review the fields and edit if needed.',
        });
      } catch (geErr) {
        setUserGeo({ lat, lng });
        writeCachedUserCoords(lat, lng);
        toast({
          title: 'Location saved for nearby stores',
          description:
            geErr instanceof Error
              ? `${geErr.message} Enter your street, city and area manually.`
              : 'We could not resolve your address. Enter your details manually.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const code = err instanceof GeolocationPositionError ? err.code : undefined;
      toast({
        title: 'Location unavailable',
        description: geolocationMessage(code),
        variant: 'destructive',
      });
    } finally {
      setLocationLoading(false);
    }
  }, [applyCoordsAndFillAddress, toast]);

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
      return [...prev, { product, supplierId: selectedSupplier!.id, supplierName: selectedSupplier!.displayName || selectedSupplier!.name, qty: 1 }];
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
    if (!deliveryAddress.trim()) { setError('Delivery address is required.'); return; }
    if (!deliveryCity.trim()) { setError('City is required.'); return; }

    setIsProcessing(true);
    setError(null);
    try {
      const card = savedCards.find(c => c.id === selectedCardId);
      const deliveryTypeMap = deliveryType === 'SELF' ? 'SELF' : deliveryType === 'STORE_DELIVERY' ? 'STORE' : 'PROVIDER';
      const deliveryStatus = deliveryType === 'SELF' ? 'SelfCollect' as const : 'PendingApproval' as const;
      const order = await createMaterialOrder({
        userId: user.id,
        storeId: selectedSupplier.id,
        branchId: selectedSupplier.id,
        storeName: selectedSupplier.displayName || selectedSupplier.name,
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
          address: deliveryAddress.trim(),
          city: deliveryCity.trim(),
          area: deliveryArea.trim() || undefined,
        },
        customerLocation: {
          address: deliveryAddress.trim(),
          city: deliveryCity.trim(),
          area: deliveryArea.trim() || undefined,
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
              <div>
                <h2 className="text-xl font-semibold">Delivery address</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We use your city and optional GPS to list nearby branches. Enter at least city for best results.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label className="text-sm font-medium">Street address</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={locationLoading}
                    onClick={() => void handleUseMyLocation()}
                  >
                    {locationLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Locating…
                      </>
                    ) : (
                      <>
                        <Navigation className="mr-2 h-4 w-4" />
                        Use my location
                      </>
                    )}
                  </Button>
                </div>
                <Input
                  placeholder="Street address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  autoComplete="street-address"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="om-step1-city" className="mb-1.5 block text-xs text-muted-foreground">
                      City
                    </Label>
                    <Input
                      id="om-step1-city"
                      placeholder="City"
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      autoComplete="address-level2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="om-step1-area" className="mb-1.5 block text-xs text-muted-foreground">
                      Area / suburb (optional)
                    </Label>
                    <Input
                      id="om-step1-area"
                      placeholder="Area or suburb"
                      value={deliveryArea}
                      onChange={(e) => setDeliveryArea(e.target.value)}
                    />
                  </div>
                </div>
                {userGeo && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    Location remembered for this session (nearby ordering).
                  </p>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <h2 className="text-xl font-semibold">Choose a store branch</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Branches are sorted by distance when your location is known. Search by store name to find your brand.
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stores…"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {storesLoading && (
                  <div className="col-span-full flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading nearby stores…
                  </div>
                )}
                {!storesLoading &&
                  sortedStoresStep1.map((sup) => {
                    const distKm =
                      typeof sup.distanceKm === 'number' && Number.isFinite(sup.distanceKm)
                        ? sup.distanceKm
                        : userGeo &&
                            typeof sup.latitude === 'number' &&
                            typeof sup.longitude === 'number' &&
                            Number.isFinite(sup.latitude) &&
                            Number.isFinite(sup.longitude)
                          ? haversineKm(userGeo.lat, userGeo.lng, sup.latitude, sup.longitude)
                          : null;
                    const addressLine = sup.address?.trim();
                    const title = sup.displayName || sup.name;
                    return (
                      <div
                        key={sup.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedSupplier(sup);
                          setStep(2);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedSupplier(sup);
                            setStep(2);
                          }
                        }}
                        className={cn(
                          'cursor-pointer rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 sm:p-5',
                          selectedSupplier?.id === sup.id && 'border-primary ring-1 ring-primary/20'
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-2xl">
                            {sup.logo || <Store className="h-5 w-5 text-primary sm:h-6 sm:w-6" />}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="font-semibold leading-tight">{title}</p>
                            {addressLine ? (
                              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 break-words">{addressLine}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Address not listed — contact the store if needed.
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {distKm != null && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                                  <Navigation className="h-3 w-3" />
                                  {formatDistanceKm(distKm)}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <Truck className="h-3 w-3" />
                                {sup.hasDelivery ? 'Delivery available' : 'Pickup only'}
                              </span>
                              {sup.hasDelivery && (
                                <span className="inline-flex items-center gap-1">
                                  Fee: {formatCurrency(sup.deliveryFee || 0)}
                                </span>
                              )}
                              <span>· {sup.products.length} products</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {!storesLoading && sortedStoresStep1.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    No stores match this area or search. Try another city or clear the search.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Browse & Add to Cart */}
          {step === 2 && selectedSupplier && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{selectedSupplier.displayName || selectedSupplier.name}</h2>
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
                      <p className="text-sm text-muted-foreground">Free - Pick up from {selectedSupplier?.displayName || selectedSupplier?.name}</p>
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
                            <p className="text-sm text-muted-foreground">Delivered by {selectedSupplier.displayName || selectedSupplier.name}</p>
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

              {!deliveryProvidersError && deliveryProviders.length === 0 && deliveryCity.trim() !== '' && (
                <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2">
                  No delivery providers available in your area. You can still collect from the store or use store delivery if this branch offers it.
                </p>
              )}

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
                <p className="font-medium mb-2">{selectedSupplier?.displayName || selectedSupplier?.name}</p>
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
