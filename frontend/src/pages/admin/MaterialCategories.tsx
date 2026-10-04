import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketplaceCategoryFormDialog } from '@/components/admin/MarketplaceCategoryFormDialog';
import type { MarketplaceCategorySaveBody } from '@/lib/marketplaceCategoryForm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CategoryInUseError,
  createAdminMarketplaceMaterialCategory,
  deleteAdminMarketplaceMaterialCategory,
  getAdminMarketplaceMaterialCategories,
  updateAdminMarketplaceMaterialCategory,
} from '@/lib/api/marketplaceMaterialCategories';
import { MarketplaceCategoryIcon } from '@/components/marketplace/marketplaceCategoryIcons';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import type { MarketplaceMaterialCategory } from '@/types';
import { Plus } from 'lucide-react';

function CategoryPresentation({ category }: { category: MarketplaceMaterialCategory }) {
  const image = category.imageUrl ? resolveUploadUrl(category.imageUrl) : '';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [image]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
        {image && !failed ? (
          <img src={image} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <MarketplaceCategoryIcon icon={category.icon} className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0">
        <div className="font-medium">{category.name}</div>
        {category.slug ? <div className="truncate text-xs text-muted-foreground">{category.slug}</div> : null}
      </div>
    </div>
  );
}

export default function AdminMaterialCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MarketplaceMaterialCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MarketplaceMaterialCategory | null>(null);
  const [inUseCount, setInUseCount] = useState<number | null>(null);

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'marketplace-material-categories'],
    queryFn: getAdminMarketplaceMaterialCategories,
  });

  const saveMut = useMutation({
    mutationFn: (body: MarketplaceCategorySaveBody) =>
      editing
        ? updateAdminMarketplaceMaterialCategory(editing.id, body)
        : createAdminMarketplaceMaterialCategory(body),
    onSuccess: () => {
      toast({ title: editing ? 'Category updated' : 'Category created' });
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'marketplace-material-categories'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleMut = useMutation({
    mutationFn: (category: MarketplaceMaterialCategory) =>
      updateAdminMarketplaceMaterialCategory(category.id, { isActive: category.isActive === false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'marketplace-material-categories'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      deleteAdminMarketplaceMaterialCategory(id, confirm),
    onSuccess: () => {
      toast({ title: 'Category deleted' });
      setDeleteTarget(null);
      setInUseCount(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'marketplace-material-categories'] });
    },
    onError: (e: Error) => {
      if (e instanceof CategoryInUseError) {
        setInUseCount(e.supplierCount);
        return;
      }
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (category: MarketplaceMaterialCategory) => {
    setEditing(category);
    setOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Material categories</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Marketplace taxonomy used to find nearby branches. This is separate from job categories and from each
              branch&apos;s own inventory categories.
            </p>
          </div>
          <Button type="button" className="btn-accent shrink-0" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add category
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border-2 border-primary bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Suppliers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Loading categories…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && error && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-destructive">
                    Could not load material categories.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No material categories yet.
                  </TableCell>
                </TableRow>
              )}
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <CategoryPresentation category={category} />
                  </TableCell>
                  <TableCell>{category.supplierCount ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={category.isActive === false ? 'outline' : 'secondary'}>
                      {category.isActive === false ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(category)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMut.mutate(category)}
                      >
                        {category.isActive === false ? 'Activate' : 'Deactivate'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          setInUseCount(null);
                          setDeleteTarget(category);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <MarketplaceCategoryFormDialog
        open={open}
        mode={editing ? 'edit' : 'create'}
        initial={editing}
        pending={saveMut.isPending}
        onOpenChange={setOpen}
        onSubmit={(body) => saveMut.mutate(body)}
      />

      <AlertDialog
        open={Boolean(deleteTarget) && inUseCount == null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete material category?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting &quot;{deleteTarget?.name}&quot; will remove this marketplace classification. Suppliers,
              branches, products, and orders are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMut.mutate({ id: deleteTarget.id, confirm: false });
              }}
            >
              {deleteMut.isPending ? 'Deleting...' : 'Delete category'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget) && inUseCount != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setInUseCount(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>This category is in use</AlertDialogTitle>
            <AlertDialogDescription>
              Assigned to {inUseCount} supplier{inUseCount === 1 ? '' : 's'}. Deleting it removes only that
              marketplace classification. Suppliers, branches, products, and orders stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMut.mutate({ id: deleteTarget.id, confirm: true });
              }}
            >
              {deleteMut.isPending ? 'Deleting...' : 'Delete anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
