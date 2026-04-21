import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  getAdminCategorySuggestions,
  approveAdminCategorySuggestion,
  type AdminCategorySuggestion,
} from '@/lib/api/adminCategories';
import { useToast } from '@/hooks/use-toast';

const EMPTY_FORM = {
  name: '',
  icon: '',
  description: '',
  requiresMaterials: false,
  requiresInspection: true,
  skillsCsv: '',
  step3Type: 'measurements' as Category['step3Type'],
  issueTypesCsv: '',
  sortOrder: 0,
};

export default function AdminCategories() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const skipSelectNext = useRef(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<AdminCategorySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories(true);
      setCategories(data);
    } catch (error) {
      toast({
        title: 'Failed to load categories',
        description: error instanceof Error ? error.message : 'Try again later.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadPendingSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await getAdminCategorySuggestions('PENDING');
      setPendingSuggestions(res.suggestions || []);
    } catch (error) {
      toast({
        title: 'Failed to load suggestions',
        description: error instanceof Error ? error.message : 'Try again later.',
        variant: 'destructive',
      });
    } finally {
      setSuggestionsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadPendingSuggestions();
  }, [loadPendingSuggestions]);

  useEffect(() => {
    const prefill = (location.state as { prefill?: { name?: string } } | null)?.prefill;
    if (prefill?.name) {
      skipSelectNext.current = true;
      setSelectedCategoryId(null);
      setForm({ ...EMPTY_FORM, name: prefill.name });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (categories.length === 0 || selectedCategoryId !== null) return;
    if (skipSelectNext.current) {
      skipSelectNext.current = false;
      return;
    }
    setSelectedCategoryId(categories[0].id);
  }, [categories, selectedCategoryId]);

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
      requiresInspection: selected.requiresInspection !== false,
      skillsCsv: (selected.skills || []).join(', '),
      step3Type: selected.step3Type,
      issueTypesCsv: (selected.issueTypes || []).join(', '),
      sortOrder: selected.sortOrder || 0,
    });
  }, [selected]);

  const startCreateCategory = () => {
    skipSelectNext.current = true;
    setSelectedCategoryId(null);
    setForm(EMPTY_FORM);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      const created = await createCategory({
        name: form.name,
        icon: form.icon || '🛠️',
        description: form.description || 'Service category',
        requiresMaterials: form.requiresMaterials,
        requiresInspection: form.requiresInspection,
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
        requiresInspection: form.requiresInspection,
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

  const isCreateMode = !selected;

  const handleApproveSuggestion = async (id: string) => {
    setIsSaving(true);
    try {
      const result = await approveAdminCategorySuggestion(id);
      toast({ title: 'Suggestion approved', description: `Category id: ${result.categoryId}` });
      await loadCategories();
      await loadPendingSuggestions();
    } catch (error) {
      toast({
        title: 'Approve failed',
        description: error instanceof Error ? error.message : 'Could not approve.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Service Categories</h1>
            <p className="text-muted-foreground">Manage categories used in user service requests</p>
          </div>
          <Button type="button" onClick={startCreateCategory}>
            Create Category
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Pending category suggestions</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadPendingSuggestions()}>
              Refresh
            </Button>
          </div>
          {suggestionsLoading ? (
            <p className="text-sm text-muted-foreground mt-2">Loading…</p>
          ) : pendingSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">No pending suggestions</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pendingSuggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      From {s.user?.name ?? s.userId}
                      {s.provider?.businessName ? ` · ${s.provider.businessName}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void handleApproveSuggestion(s.id)}
                  >
                    Approve &amp; create
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="category-search"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search categories"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            {filtered.map((cat) => (
              <button
                key={cat.id}
                type="button"
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
            {isCreateMode ? (
              <div className="text-center py-6 border-b border-border">
                <Tags className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">New category</p>
                <p className="text-sm text-muted-foreground">Fill in the fields and save to create.</p>
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-icon">Icon (emoji)</Label>
                <Input
                  id="cat-icon"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Input
                id="cat-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat-skills">Skills (comma separated)</Label>
                <Input
                  id="cat-skills"
                  value={form.skillsCsv}
                  onChange={(e) => setForm((f) => ({ ...f, skillsCsv: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-issues">Issue types (comma separated)</Label>
                <Input
                  id="cat-issues"
                  value={form.issueTypesCsv}
                  onChange={(e) => setForm((f) => ({ ...f, issueTypesCsv: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="cat-step3">Step 3 type</Label>
                <select
                  id="cat-step3"
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  value={form.step3Type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, step3Type: e.target.value as Category['step3Type'] }))
                  }
                >
                  <option value="measurements">measurements</option>
                  <option value="items">items</option>
                  <option value="issue">issue</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-sort">Sort order</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cat-req-mat"
                  checked={form.requiresMaterials}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, requiresMaterials: Boolean(v) }))}
                />
                <Label htmlFor="cat-req-mat" className="font-normal cursor-pointer">
                  Requires materials
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cat-req-insp"
                  checked={form.requiresInspection}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, requiresInspection: Boolean(v) }))}
                />
                <Label htmlFor="cat-req-insp" className="font-normal cursor-pointer">
                  Requires inspection
                </Label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={isCreateMode ? handleCreate : handleSave} disabled={isSaving}>
                {isCreateMode ? 'Save new category' : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" onClick={startCreateCategory}>
                Clear / new
              </Button>
              {!isCreateMode ? (
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSaving}>
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
