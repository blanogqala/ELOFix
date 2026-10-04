import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MarketplaceCategoryChecklist } from '@/components/marketplace/MarketplaceCategoryChecklist';
import { MarketplaceCategoryFormDialog } from '@/components/admin/MarketplaceCategoryFormDialog';
import {
  assignAdminSupplierMarketplaceCategories,
  createAdminMarketplaceMaterialCategory,
  getAdminMarketplaceMaterialCategories,
} from '@/lib/api/marketplaceMaterialCategories';
import type { MarketplaceCategorySaveBody } from '@/lib/marketplaceCategoryForm';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

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
    mutationFn: (body: MarketplaceCategorySaveBody) => createAdminMarketplaceMaterialCategory(body),
    onSuccess: () => {
      toast({ title: 'Category created' });
      setCreateOpen(false);
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

      <MarketplaceCategoryFormDialog
        open={createOpen}
        mode="create"
        pending={createMut.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={(body) => createMut.mutate(body)}
      />
    </section>
  );
}
