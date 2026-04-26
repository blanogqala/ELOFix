import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getSuppliers, createSupplier, addProduct, updateProductPrice } from '@/lib/api/suppliers';
import { Supplier, Product } from '@/types';
import { Search, Package, Plus, Truck, ShoppingBag, Tag } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function AdminSuppliers() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [manageSupplier, setManageSupplier] = useState<Supplier | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: '',
    price: '',
    qualityTier: 'medium' as Product['qualityTier'],
    unit: 'unit',
  });
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setSuppliers(await getSuppliers()); }
    catch { /* no-op */ }
    finally { setIsLoading(false); }
  };

  const handleAddProduct = async () => {
    if (!manageSupplier) return;
    if (!newProduct.name.trim() || !newProduct.category.trim() || !newProduct.price.trim()) {
      toast({ title: 'Fill name, category, and price', variant: 'destructive' });
      return;
    }
    const price = parseFloat(newProduct.price);
    if (Number.isNaN(price) || price < 0) {
      toast({ title: 'Invalid price', variant: 'destructive' });
      return;
    }
    try {
      const product: Product = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`,
        name: newProduct.name.trim(),
        category: newProduct.category.trim(),
        price,
        qualityTier: newProduct.qualityTier,
        unit: newProduct.unit.trim() || 'unit',
        inStock: true,
      };
      await addProduct(manageSupplier.id, product);
      toast({ title: 'Product added' });
      setNewProduct({ name: '', category: '', price: '', qualityTier: 'medium', unit: 'unit' });
      const next = await getSuppliers();
      setSuppliers(next);
      const updated = next.find((s) => s.id === manageSupplier.id);
      if (updated) setManageSupplier(updated);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleSavePrice = async (productId: string) => {
    if (!manageSupplier) return;
    const raw = priceEdits[productId];
    const num = parseFloat(raw);
    if (raw === undefined || Number.isNaN(num) || num < 0) {
      toast({ title: 'Invalid price', variant: 'destructive' });
      return;
    }
    try {
      await updateProductPrice(manageSupplier.id, productId, num);
      toast({ title: 'Price updated' });
      const next = await getSuppliers();
      setSuppliers(next);
      const updated = next.find((s) => s.id === manageSupplier.id);
      if (updated) setManageSupplier(updated);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createSupplier(newName.trim());
      toast({ title: 'Supplier created' });
      setAddOpen(false);
      setNewName('');
      load();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const filtered = suppliers.filter(s =>
    !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Suppliers</h1>
            <p className="text-muted-foreground">Manage material suppliers and their product catalogs</p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Supplier
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card-elevated p-6 animate-pulse">
                <div className="h-6 w-48 bg-muted rounded mb-4" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(supplier => (
              <div key={supplier.id} className="card-elevated p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                    {supplier.logo || '🏪'}
                  </div>
                  <div>
                    <h3 className="font-semibold">{supplier.name}</h3>
                    <p className="text-xs text-muted-foreground">ID: {supplier.id}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShoppingBag className="h-4 w-4" />
                    {supplier.products.length} products
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Truck className="h-4 w-4" />
                    {supplier.hasDelivery ? `R${supplier.deliveryFee} delivery` : 'No delivery'}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    {supplier.products.filter(p => p.special).length} specials
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(supplier.products.map(p => p.category))).map(cat => (
                    <span key={cat} className="px-2 py-0.5 bg-muted rounded-full text-xs capitalize">{cat}</span>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setManageSupplier(supplier);
                    const edits: Record<string, string> = {};
                    supplier.products.forEach((p) => {
                      edits[p.id] = String(p.price);
                    });
                    setPriceEdits(edits);
                  }}
                >
                  Manage Products
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-elevated p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No suppliers found</h3>
            <p className="text-sm text-muted-foreground">Add your first supplier to get started</p>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Supplier Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. BuildMart Pro" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!newName.trim()}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manageSupplier !== null} onOpenChange={(o) => !o && setManageSupplier(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Products — {manageSupplier?.name}</DialogTitle>
          </DialogHeader>
          {manageSupplier && (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Catalog</p>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {manageSupplier.products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No products yet.</p>
                  ) : (
                    manageSupplier.products.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="flex-1 min-w-[120px] font-medium">{p.name}</span>
                        <span className="text-muted-foreground text-xs capitalize">{p.category}</span>
                        <Input
                          className="w-24 h-8"
                          type="number"
                          min={0}
                          step={1}
                          value={priceEdits[p.id] ?? String(p.price)}
                          onChange={(e) =>
                            setPriceEdits((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                        />
                        <Button size="sm" variant="secondary" onClick={() => void handleSavePrice(p.id)}>
                          Save
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Add product</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={newProduct.name}
                      onChange={(e) => setNewProduct((x) => ({ ...x, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Category id</Label>
                    <Input
                      placeholder="matches category slug"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct((x) => ({ ...x, category: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Price (R)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={newProduct.price}
                      onChange={(e) => setNewProduct((x) => ({ ...x, price: e.target.value }))}
                    />
                  </div>
                </div>
                <Button className="w-full sm:w-auto" onClick={() => void handleAddProduct()}>
                  Add to catalog
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
