import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteSupplierProduct,
  getSupplierMe,
  getSupplierInventoryCategories,
  patchSupplierProduct,
  postSupplierInventoryCategory,
  postSupplierProduct,
  uploadSupplierProductImage,
} from '@/lib/api/supplierPortal';
import type { Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Pencil, ChevronDown, Search, ArrowLeft, Loader2 } from 'lucide-react';
import { ProductCardSkeleton } from '@/components/common/loading';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORY_NEW = '__create_new__';

/** Canonical key for grouping; matches backend normalization (lowercase, trimmed). */
function canonicalInventoryCategory(cat: string): string {
  const s = cat.trim().toLowerCase();
  return s.length ? s : 'general';
}

function formatCategoryLabel(cat: string): string {
  const t = cat.trim();
  if (!t) return 'General';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function SupplierInventory({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isBranchStaff = user?.role === 'branch_staff';
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPositiveQtyRef = useRef<Map<string, number>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [categorySelect, setCategorySelect] = useState('general');
  const [newCategoryDraft, setNewCategoryDraft] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    category: 'general',
    price: '',
    unit: 'unit',
    quantity: '1',
    description: '',
    imageUrlOverride: '',
    qualityTier: 'medium' as Product['qualityTier'],
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const branches = useMemo(() => profile?.branches ?? [], [profile?.branches]);

  useEffect(() => {
    if (isBranchStaff && user && 'branchId' in user && user.branchId) {
      setSelectedBranchId(user.branchId);
      return;
    }
    if (!branches.length) return;
    setSelectedBranchId((prev) => {
      if (prev && branches.some((b) => b.id === prev)) return prev;
      const next = branches.find((b) => b.isActive !== false) ?? branches[0];
      return next?.id ?? '';
    });
  }, [branches, isBranchStaff, user]);

  const branchProducts = useMemo(() => {
    const b = branches.find((x) => x.id === selectedBranchId);
    return b?.products?.length ? b.products : profile?.products ?? [];
  }, [branches, selectedBranchId, profile?.products]);

  const { data: inventoryCategories = [] } = useQuery({
    queryKey: ['supplier', 'inventoryCategories', userId, selectedBranchId],
    queryFn: () => getSupplierInventoryCategories(selectedBranchId),
    enabled: Boolean(userId && selectedBranchId),
  });

  useEffect(() => {
    if (!branchProducts.length) return;
    for (const p of branchProducts) {
      const q = Number(p.quantity ?? 0);
      if (q > 0 && q < 500_000) {
        lastPositiveQtyRef.current.set(p.id, Math.floor(q));
      }
    }
  }, [branchProducts]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'inventoryCategories', userId] });
  };

  /** Unique canonical category keys for filters + picker (inventory API + existing products). */
  const mergedCategoryKeys = useMemo(() => {
    const keys = new Set<string>();
    keys.add('general');
    for (const c of inventoryCategories) {
      keys.add(canonicalInventoryCategory(c.name));
    }
    for (const p of branchProducts) {
      keys.add(canonicalInventoryCategory(String(p.category ?? 'general')));
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [inventoryCategories, branchProducts]);

  /** Alias kept for parity with cached HMR/old bundles that referenced `categoryOptions`. Same as mergedCategoryKeys. */
  const categoryOptions = mergedCategoryKeys;

  const mutPatch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Product> }) =>
      patchSupplierProduct(id, { ...patch, branchId: selectedBranchId }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const mutDel = useMutation({
    mutationFn: (id: string) => deleteSupplierProduct(id, selectedBranchId),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Removed' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resetForm = () => {
    setEditId(null);
    setFormErrors({});
    setImageFile(null);
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setForm({
      name: '',
      category: 'general',
      price: '',
      unit: 'unit',
      quantity: '1',
      description: '',
      imageUrlOverride: '',
      qualityTier: 'medium',
    });
    setCategorySelect('general');
    setNewCategoryDraft('');
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditId(p.id);
    setFormErrors({});
    setImageFile(null);
    if (imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(resolveUploadUrl(p.image) || null);
    const rawQty = p.quantity ?? (p.inStock ? 1 : 0);
    const saneQty =
      typeof rawQty === 'number' && rawQty >= 500_000 ? lastPositiveQtyRef.current.get(p.id) ?? 1 : rawQty;
    const canon = canonicalInventoryCategory(String(p.category ?? 'general'));
    setCategorySelect(canon);
    setNewCategoryDraft('');
    setForm({
      name: p.name,
      category: canon,
      price: String(p.price),
      unit: p.unit,
      quantity: String(Math.max(0, Math.floor(Number(saneQty)))),
      description: p.description || '',
      imageUrlOverride: '',
      qualityTier: p.qualityTier,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDialogOpen(true);
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setForm((prev) => ({ ...prev, imageUrlOverride: '' }));
    const blob = URL.createObjectURL(f);
    if (imagePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(blob);
  };

  const [isSaving, setIsSaving] = useState(false);

  const validateForm = (): boolean => {
    const err: Record<string, string> = {};
    if (!form.name.trim()) err.name = 'Name is required';
    if (categorySelect === CATEGORY_NEW && !newCategoryDraft.trim()) {
      err.category = 'Enter a new category name';
    }
    const price = parseFloat(form.price);
    if (Number.isNaN(price) || price < 0) err.price = 'Enter a valid price';
    const qty = parseInt(form.quantity, 10);
    if (Number.isNaN(qty) || qty < 0) err.quantity = 'Enter a valid quantity';

    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    let resolvedCategory = canonicalInventoryCategory(
      categorySelect === CATEGORY_NEW ? newCategoryDraft.trim() : categorySelect
    );

    if (categorySelect === CATEGORY_NEW) {
      const raw = newCategoryDraft.trim();
      try {
        const row = await postSupplierInventoryCategory(raw, selectedBranchId);
        resolvedCategory = row.name;
      } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 409) {
          resolvedCategory = canonicalInventoryCategory(raw);
        } else {
          toast({
            title: 'Error',
            description: e instanceof Error ? e.message : 'Could not create category',
            variant: 'destructive',
          });
          return;
        }
      }
    }

    const price = parseFloat(form.price);
    const qty = Math.max(0, parseInt(form.quantity, 10) || 0);

    if (!selectedBranchId) {
      toast({ title: 'Select a branch', description: 'Choose a branch before saving products.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const r = await uploadSupplierProductImage(imageFile);
        imageUrl = r.url;
      } else if (form.imageUrlOverride.trim()) {
        imageUrl = form.imageUrlOverride.trim();
      }
      const imagePatch =
        imageUrl !== undefined ? { image: imageUrl } : ({} as { image?: string });
      if (editId) {
        await patchSupplierProduct(editId, {
          branchId: selectedBranchId,
          name: form.name.trim(),
          category: resolvedCategory,
          price,
          unit: form.unit.trim(),
          qualityTier: form.qualityTier,
          quantity: qty,
          inStock: qty > 0,
          description: form.description.trim() || undefined,
          ...imagePatch,
        });
        lastPositiveQtyRef.current.set(editId, qty > 0 ? qty : lastPositiveQtyRef.current.get(editId) ?? 1);
        toast({ title: 'Updated' });
      } else {
        await postSupplierProduct({
          name: form.name.trim(),
          category: resolvedCategory,
          price,
          unit: form.unit.trim(),
          qualityTier: form.qualityTier,
          quantity: qty,
          inStock: qty > 0,
          description: form.description.trim() || undefined,
          branchId: selectedBranchId,
          ...(imageUrl !== undefined ? { image: imageUrl } : {}),
        });
        toast({ title: 'Product saved' });
      }
      invalidate();
      setDialogOpen(false);
      resetForm();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const productsFiltered = useMemo(() => {
    const raw = branchProducts;
    const q = search.trim().toLowerCase();
    return raw.filter((p) => {
      const cat = canonicalInventoryCategory(String(p.category ?? 'general'));
      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
      if (!q) return true;
      const hay = `${p.name} ${cat}`.toLowerCase();
      return hay.includes(q);
    });
  }, [branchProducts, search, categoryFilter]);

  const byCategory = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of productsFiltered) {
      const c = canonicalInventoryCategory(String(p.category ?? 'general'));
      const list = m.get(c) || [];
      list.push(p);
      m.set(c, list);
    }
    return m;
  }, [productsFiltered]);

  const categoriesSorted = useMemo(
    () => [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    [byCategory]
  );

  useEffect(() => {
    if (expandedCategory && !byCategory.has(expandedCategory)) {
      setExpandedCategory(null);
    }
  }, [expandedCategory, byCategory]);

  const handleStockSwitch = (p: Product, inStockNext: boolean) => {
    if (inStockNext) {
      const saved = lastPositiveQtyRef.current.get(p.id);
      const fromProduct =
        typeof p.quantity === 'number' && p.quantity > 0 && p.quantity < 500_000
          ? Math.floor(p.quantity)
          : null;
      const q = Math.max(1, fromProduct ?? saved ?? 1);
      lastPositiveQtyRef.current.set(p.id, q);
      void mutPatch.mutateAsync({ id: p.id, patch: { inStock: true, quantity: q } });
    } else {
      const current = typeof p.quantity === 'number' && p.quantity > 0 ? Math.floor(p.quantity) : 1;
      if (current <= 500_000) lastPositiveQtyRef.current.set(p.id, current);
      void mutPatch.mutateAsync({ id: p.id, patch: { inStock: false, quantity: 0 } });
    }
  };

  const renderProductCard = (p: Product) => (
    <Card className="card-elevated h-full overflow-hidden">
      <div
        className={cn(
          'aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground overflow-hidden',
        )}
      >
        {p.image ? (
          <img src={resolveUploadUrl(p.image)} alt="" className="h-full w-full object-cover" />
        ) : (
          'No image'
        )}
      </div>
      <CardHeader className="space-y-1 py-3">
        <p className="text-xs text-muted-foreground">{formatCategoryLabel(String(p.category || 'general'))}</p>
        <CardTitle className="text-base leading-tight">{p.name}</CardTitle>
        <p className="text-lg font-bold">{formatCurrency(p.price)}</p>
        <p className="text-xs text-muted-foreground">Qty: {p.inStock ? p.quantity ?? '—' : 0}</p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
          <span className="text-sm text-muted-foreground">In stock</span>
          <Switch
            checked={Boolean(p.inStock)}
            disabled={mutPatch.isPending}
            onCheckedChange={(v) => handleStockSwitch(p, v)}
            aria-label={p.inStock ? 'Mark out of stock' : 'Mark in stock'}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(p)}>
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => mutDel.mutate(p.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading || !profile) {
    return <ProductCardSkeleton count={8} />;
  }

  if (!branches.length || !selectedBranchId) {
    return (
      <p className="text-sm text-muted-foreground">
        No branches on your account yet. Add a branch from My Branches, then return here to manage stock.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!isBranchStaff && (
        <div className="flex flex-col gap-2 sm:max-w-md">
          <Label htmlFor="supplier-inv-branch">Branch</Label>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
            <SelectTrigger id="supplier-inv-branch">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.displayName || b.name}
                  {b.isActive === false ? ' (inactive)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {isBranchStaff && (
        <p className="text-xs text-muted-foreground">You can only edit inventory for your assigned branch.</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search inventory"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {formatCategoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" className="btn-accent shrink-0" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add item
        </Button>
      </div>

      {byCategory.size === 0 && (
        <Card className="card-elevated border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No items match</CardTitle>
            <p className="text-sm text-muted-foreground">
              {branchProducts.length
                ? 'Try another search or category.'
                : 'Add your first SKU to appear in the customer storefront.'}
            </p>
          </CardHeader>
        </Card>
      )}

      {expandedCategory && byCategory.has(expandedCategory) && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1 text-muted-foreground"
              onClick={() => setExpandedCategory(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to inventory
            </Button>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{formatCategoryLabel(expandedCategory)}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(byCategory.get(expandedCategory) ?? []).map((p) => (
              <div key={p.id} className="h-full">
                {renderProductCard(p)}
              </div>
            ))}
          </div>
        </div>
      )}

      {!expandedCategory &&
        categoriesSorted.map(([cat, products]) => {
          const preview = products.slice(0, 3);
          const hasMore = products.length > 3;
          return (
            <div key={cat} className="space-y-2 transition-opacity duration-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{formatCategoryLabel(cat)}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{products.length} item(s)</span>
              </div>
              <div className="relative">
                <div className="-mx-1 flex gap-4 overflow-x-auto pb-3 pt-1 px-1 scroll-smooth">
                  {preview.map((p) => (
                    <div key={p.id} className="w-[min(100%,268px)] min-w-[240px] flex-shrink-0 snap-start">
                      {renderProductCard(p)}
                    </div>
                  ))}
                </div>
              </div>
              {hasMore && (
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => setExpandedCategory(cat)}>
                  View more ({products.length} items)
                </Button>
              )}
            </div>
          );
        })}

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            resetForm();
            setDialogOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit item' : 'Add item'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image</p>
              <div>
                <Label htmlFor="supplier-product-image">Upload</Label>
                <Input
                  id="supplier-product-image"
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="mt-1 cursor-pointer"
                  onChange={onPickImage}
                />
                <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP, or GIF · up to 8 MB.</p>
                {imagePreviewUrl && (
                  <div className="mt-2 rounded-md border border-border overflow-hidden aspect-video bg-muted flex items-center justify-center max-h-48">
                    <img src={imagePreviewUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                <Collapsible className="mt-2">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="text-xs px-1 h-auto">
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Paste image URL instead
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <Input
                      placeholder="https://..."
                      value={form.imageUrlOverride}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, imageUrlOverride: e.target.value }))
                      }
                    />
                    {form.imageUrlOverride.trim() &&
                      /^https?:\/\//i.test(form.imageUrlOverride.trim()) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          External URL is saved when you submit.
                        </p>
                      )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basics</p>
              <div>
                <Label htmlFor="supplier-product-name">Name</Label>
                <Input
                  id="supplier-product-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={cn(formErrors.name && 'border-destructive')}
                />
                {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
              </div>
              <div>
                <Label htmlFor="supplier-product-category">Category</Label>
                <Select
                  value={categorySelect}
                  onValueChange={(v) => {
                    setCategorySelect(v);
                    if (v !== CATEGORY_NEW) {
                      setNewCategoryDraft('');
                      setForm((f) => ({ ...f, category: v }));
                    }
                  }}
                >
                  <SelectTrigger
                    id="supplier-product-category"
                    className={cn(formErrors.category && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {formatCategoryLabel(c)}
                      </SelectItem>
                    ))}
                    <SelectItem value={CATEGORY_NEW}>Create new category…</SelectItem>
                  </SelectContent>
                </Select>
                {categorySelect === CATEGORY_NEW && (
                  <div className="mt-2 space-y-1">
                    <Label htmlFor="supplier-new-category-name" className="text-xs text-muted-foreground">
                      New category name
                    </Label>
                    <Input
                      id="supplier-new-category-name"
                      placeholder="e.g. Tiles"
                      value={newCategoryDraft}
                      onChange={(e) => setNewCategoryDraft(e.target.value)}
                    />
                  </div>
                )}
                {formErrors.category && (
                  <p className="mt-1 text-xs text-destructive">{formErrors.category}</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing & stock</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="supplier-product-price">Price</Label>
                  <Input
                    id="supplier-product-price"
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className={cn(formErrors.price && 'border-destructive')}
                  />
                  {formErrors.price && <p className="mt-1 text-xs text-destructive">{formErrors.price}</p>}
                </div>
                <div>
                  <Label htmlFor="supplier-product-qty">Quantity</Label>
                  <Input
                    id="supplier-product-qty"
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    className={cn(formErrors.quantity && 'border-destructive')}
                  />
                  {formErrors.quantity && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.quantity}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional details for customers"
              />
            </section>

            <Button
              type="button"
              className="btn-accent w-full"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSaving ? 'Saving…' : editId ? 'Save changes' : 'Add item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
