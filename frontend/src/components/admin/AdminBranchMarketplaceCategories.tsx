import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MarketplaceCategoryChecklist } from '@/components/marketplace/MarketplaceCategoryChecklist';
import { MARKETPLACE_ICON_OPTIONS } from '@/components/marketplace/marketplaceCategoryIcons';
import {
  assignAdminSupplierMarketplaceCategories,
  createAdminMarketplaceMaterialCategory,
  getAdminMarketplaceMaterialCategories,
} from '@/lib/api/marketplaceMaterialCategories';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

const NO_ICON = '__none__';

export function AdminBranchMarketplaceCategories({
  supplierId,
  allCategories,
  categoryIds,
}: {
  supplierId: string;
  allCategories: boolean;
  categoryIds: string[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['admin', 'marketplace-material-categories'],
    queryFn: getAdminMarketplaceMaterialCategories,
  });
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [allMode, setAllMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(NO_ICON);
  const [imageUrl, setImageUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setDraftIds(categoryIds);
    setAllMode(allCategories);
  }, [allCategories, categoryIds]);

  const saveMut = useMutation({
    mutationFn: () =>
      assignAdminSupplierMarketplaceCategories(supplierId, {
        categoryIds: draftIds,
        allCategories: allMode,
      }),
    onSuccess: () => {
      toast({ title: 'Categories saved' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'supplier', supplierId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'marketplace-material-categories'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createAdminMarketplaceMaterialCategory({
        name: name.trim(),
        description: description.trim() || null,
        icon: icon === NO_ICON ? null : icon,
        imageUrl: imageUrl.trim() || null,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      }),
    onSuccess: () => {
      toast({ title: 'Category created' });
      setCreateOpen(false);
      setName('');
      setDescription('');
      setIcon(NO_ICON);
      setImageUrl('');
      setSortOrder('0');
      setIsActive(true);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'marketplace-material-categories'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <section className="space-y-4 rounded-xl border-2 border-primary bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Marketplace categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These categories apply to every current and future branch for this supplier.
          </p>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create category
        </Button>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
        <Checkbox
          checked={allMode}
          onCheckedChange={(value) => setAllMode(value === true)}
          aria-label="All categories"
          disabled={saveMut.isPending}
        />
        <span>
          <span className="text-sm font-medium">All categories</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Includes categories created later. Turning this off restores the previous selection.
          </span>
        </span>
      </label>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : (
        <MarketplaceCategoryChecklist
          categories={categories}
          selectedIds={draftIds}
          showInactive
          disabled={allMode || saveMut.isPending}
          onChange={setDraftIds}
        />
      )}

      <Button type="button" className="btn-accent" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
        Save
      </Button>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New material category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="supplier-mmc-name">Name</Label>
              <Input id="supplier-mmc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-mmc-desc">Description</Label>
              <Textarea id="supplier-mmc-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger>
                    <SelectValue placeholder="Icon" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ICON}>None</SelectItem>
                    {MARKETPLACE_ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-mmc-order">Display order</Label>
                <Input
                  id="supplier-mmc-order"
                  inputMode="numeric"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-mmc-image">Image URL</Label>
              <Input
                id="supplier-mmc-image"
                value={imageUrl}
                placeholder="Optional"
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="supplier-mmc-active">Active</Label>
              <Switch id="supplier-mmc-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-accent"
              disabled={createMut.isPending || !name.trim()}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
