import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Search, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Category } from '@/types';
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '@/lib/api/categories';
import { useToast } from '@/hooks/use-toast';

const EMPTY_FORM = {
  name: '',
  icon: '',
  description: '',
  requiresMaterials: false,
  skillsCsv: '',
  step3Type: 'measurements' as Category['step3Type'],
  issueTypesCsv: '',
  sortOrder: 0,
};

export default function AdminCategories() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories(true);
      setCategories(data);
      if (!selectedCategoryId && data.length > 0) setSelectedCategoryId(data[0].id);
    } catch (error) {
      toast({
        title: 'Failed to load categories',
        description: error instanceof Error ? error.message : 'Try again later.',
        variant: 'destructive',
      });
    }
  }, [selectedCategoryId, toast]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const filtered = useMemo(
    () =>
      categories.filter(
        (c) =>
          !searchQuery ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.id.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [categories, searchQuery]
  );

  const selected = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  useEffect(() => {
    if (!selected) return;
    setForm({
      name: selected.name,
      icon: selected.icon,
      description: selected.description,
      requiresMaterials: selected.requiresMaterials,
      skillsCsv: (selected.skills || []).join(', '),
      step3Type: selected.step3Type,
      issueTypesCsv: (selected.issueTypes || []).join(', '),
      sortOrder: selected.sortOrder || 0,
    });
  }, [selected]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      const created = await createCategory({
        name: form.name,
        icon: form.icon || '🛠️',
        description: form.description || 'Service category',
        requiresMaterials: form.requiresMaterials,
        skills: form.skillsCsv.split(',').map((s) => s.trim()).filter(Boolean),
        step3Type: form.step3Type,
        issueTypes: form.issueTypesCsv.split(',').map((s) => s.trim()).filter(Boolean),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: true,
      });
      setCategories((prev) => [...prev, created]);
      setSelectedCategoryId(created.id);
      toast({ title: 'Category created' });
    } catch (error) {
      toast({
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Could not create category.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const updated = await updateCategory(selected.id, {
        name: form.name,
        icon: form.icon,
        description: form.description,
        requiresMaterials: form.requiresMaterials,
        skills: form.skillsCsv.split(',').map((s) => s.trim()).filter(Boolean),
        step3Type: form.step3Type,
        issueTypes: form.issueTypesCsv.split(',').map((s) => s.trim()).filter(Boolean),
        sortOrder: Number(form.sortOrder) || 0,
      });
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast({ title: 'Category updated' });
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Could not update category.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      await deleteCategory(selected.id);
      const remaining = categories.filter((c) => c.id !== selected.id);
      setCategories(remaining);
      setSelectedCategoryId(remaining[0]?.id || null);
      toast({ title: 'Category deleted' });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete category.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Service Categories</h1>
          <p className="text-muted-foreground">Manage categories used in user service requests</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            {filtered.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={cn(
                  'w-full p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3',
                  selectedCategoryId === cat.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30 card-elevated'
                )}
              >
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <p className="font-medium text-sm">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.id}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 card-elevated p-6 space-y-4">
            {!selected ? (
              <div className="text-center py-10">
                <Tags className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Create your first category below.</p>
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Icon (emoji)" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
            </div>
            <Input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                placeholder="Skills (comma separated)"
                value={form.skillsCsv}
                onChange={(e) => setForm((f) => ({ ...f, skillsCsv: e.target.value }))}
              />
              <Input
                placeholder="Issue types (comma separated)"
                value={form.issueTypesCsv}
                onChange={(e) => setForm((f) => ({ ...f, issueTypesCsv: e.target.value }))}
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <select
                className="h-10 rounded-md border border-input bg-background px-3"
                value={form.step3Type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, step3Type: e.target.value as Category['step3Type'] }))
                }
              >
                <option value="measurements">measurements</option>
                <option value="items">items</option>
                <option value="issue">issue</option>
              </select>
              <Input
                type="number"
                placeholder="Sort order"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.requiresMaterials}
                  onChange={(e) => setForm((f) => ({ ...f, requiresMaterials: e.target.checked }))}
                />
                Requires materials
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={selected ? handleSave : handleCreate} disabled={isSaving}>
                {selected ? 'Save Changes' : 'Create Category'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedCategoryId(null);
                  setForm(EMPTY_FORM);
                }}
              >
                New
              </Button>
              {selected ? (
                <Button variant="destructive" onClick={handleDelete} disabled={isSaving}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

