import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MarketplaceCategoryChecklist } from '@/components/marketplace/MarketplaceCategoryChecklist';
import {
  assignAdminBranchMarketplaceCategories,
  getAdminMarketplaceMaterialCategories,
} from '@/lib/api/marketplaceMaterialCategories';
import { useToast } from '@/hooks/use-toast';
import type { SupplierBranchProfile } from '@/types';

export function AdminBranchMarketplaceCategories({
  supplierId,
  branches,
}: {
  supplierId: string;
  branches: SupplierBranchProfile[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['admin', 'marketplace-material-categories'],
    queryFn: getAdminMarketplaceMaterialCategories,
  });
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const branch of branches) {
      next[branch.id] = (branch.marketplaceCategories ?? []).map((category) => category.id);
    }
    setDrafts(next);
  }, [branches]);

  const saveMut = useMutation({
    mutationFn: (branchId: string) =>
      assignAdminBranchMarketplaceCategories(supplierId, branchId, drafts[branchId] ?? []),
    onSuccess: () => {
      toast({ title: 'Branch categories saved' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'supplier', supplierId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'marketplace-material-categories'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (branches.length === 0) return null;

  return (
    <section className="space-y-4 rounded-xl border-2 border-primary bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Marketplace categories</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Categories are assigned per branch. They decide which nearby stores appear when a customer chooses a material
          type. They do not replace the inventory categories inside a branch.
        </p>
      </div>
      <div className="space-y-4">
        {branches.map((branch) => (
          <div key={branch.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{branch.displayName || branch.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[branch.area, branch.city].filter(Boolean).join(', ') || 'Branch'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {(branch.marketplaceCategories ?? []).map((category) => (
                  <Badge key={category.id} variant="outline" className="font-normal">
                    {category.name}
                  </Badge>
                ))}
              </div>
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading categories…</p>
            ) : (
              <MarketplaceCategoryChecklist
                categories={categories}
                selectedIds={drafts[branch.id] ?? []}
                showInactive
                disabled={saveMut.isPending}
                onChange={(ids) => setDrafts((prev) => ({ ...prev, [branch.id]: ids }))}
              />
            )}
            <Button
              type="button"
              size="sm"
              className="btn-accent"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate(branch.id)}
            >
              Save categories
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
