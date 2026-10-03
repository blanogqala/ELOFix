import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { MARKETPLACE_ICON_OPTIONS } from '@/components/marketplace/marketplaceCategoryIcons';
import type { MarketplaceMaterialCategory } from '@/types';
import { Plus } from 'lucide-react';

type FormState = {
  name: string;
  description: string;
  icon: string;
  imageUrl: string;
  sortOrder: string;
  isActive: boolean;
};

const NO_ICON = '__none__';

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  icon: NO_ICON,
  imageUrl: '',
  sortOrder: '0',
  isActive: true,
};

function toForm(category: MarketplaceMaterialCategory): FormState {
  return {
    name: category.name,
    description: category.description || '',
    icon: category.icon || NO_ICON,
    imageUrl: category.imageUrl || '',
    sortOrder: String(category.sortOrder ?? 0),
    isActive: category.isActive !== false,
  };
}

export default function AdminMaterialCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MarketplaceMaterialCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<MarketplaceMaterialCategory | null>(null);
  const [inUseCount, setInUseCount] = useState<number | null>(null);

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'marketplace-material-categories'],
    queryFn: getAdminMarketplaceMaterialCategories,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: !form.icon || form.icon === NO_ICON ? null : form.icon,
        imageUrl: form.imageUrl.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      return editing
        ? updateAdminMarketplaceMaterialCategory(editing.id, body)
        : createAdminMarketplaceMaterialCategory(body);
    },
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
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (category: MarketplaceMaterialCategory) => {
    setEditing(category);
    setForm(toForm(category));
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
                <TableHead>Name</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Suppliers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Loading categories…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && error && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-destructive">
                    Could not load material categories.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !error && categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No material categories yet.
                  </TableCell>
                </TableRow>
              )}
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <div className="font-medium">{category.name}</div>
                    <div className="text-xs text-muted-foreground">{category.slug}</div>
                  </TableCell>
                  <TableCell>{category.sortOrder ?? 0}</TableCell>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit material category' : 'New material category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mmc-name">Name</Label>
              <Input id="mmc-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mmc-desc">Description</Label>
              <Textarea
                id="mmc-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={form.icon} onValueChange={(icon) => setForm((f) => ({ ...f, icon }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Icon" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ICON}>None</SelectItem>
                    {form.icon &&
                    form.icon !== NO_ICON &&
                    !MARKETPLACE_ICON_OPTIONS.some((option) => option.value === form.icon) ? (
                      <SelectItem value={form.icon}>{form.icon}</SelectItem>
                    ) : null}
                    {MARKETPLACE_ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mmc-order">Display order</Label>
                <Input
                  id="mmc-order"
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mmc-image">Image URL</Label>
              <Input
                id="mmc-image"
                value={form.imageUrl}
                placeholder="Optional"
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="mmc-active">Active</Label>
              <Switch id="mmc-active" checked={form.isActive} onCheckedChange={(isActive) => setForm((f) => ({ ...f, isActive }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="btn-accent" disabled={saveMut.isPending || !form.name.trim()} onClick={() => saveMut.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget) && inUseCount == null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the material category. Suppliers, branches, products, and orders are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMut.mutate({ id: deleteTarget.id, confirm: false });
              }}
            >
              Delete
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
        <AlertDialogContent>
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
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMut.mutate({ id: deleteTarget.id, confirm: true });
              }}
            >
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
