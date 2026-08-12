import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  rejectAdminCategorySuggestion,
  type AdminCategorySuggestion,
} from '@/lib/api/adminCategories';
import { useToast } from '@/hooks/use-toast';
import { useIsLgUp } from '@/hooks/use-media-query';
import { socket } from '@/lib/socket';
import { CategoryStatsCards } from '@/components/admin/categories/CategoryStatsCards';
import { CategoryListCards } from '@/components/admin/categories/CategoryListCards';
import { CategoryEditorForm } from '@/components/admin/categories/CategoryEditorForm';
import { PendingCategorySuggestionsPanel } from '@/components/admin/categories/PendingCategorySuggestionsPanel';
import {
  EMPTY_CATEGORY_FORM,
  categoryToForm,
  parseSkillsCsv,
  type CategoryFormState,
} from '@/components/admin/categories/categoryForm';

export default function AdminCategories() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSplitLayout = useIsLgUp();
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [compactDetailView, setCompactDetailView] = useState(false);
  const { toast } = useToast();
  const skipSelectNext = useRef(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<AdminCategorySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [providerFilterId, setProviderFilterId] = useState(searchParams.get('providerId') || '');
  const [suggestionFilterId, setSuggestionFilterId] = useState(searchParams.get('suggestionId') || '');

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
      setForm({ ...EMPTY_CATEGORY_FORM, name: prefill.name });
      if (!isSplitLayout) setCompactDetailView(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, isSplitLayout]);

  useEffect(() => {
    const providerIdFromState = (location.state as { providerId?: string } | null)?.providerId;
    const suggestionIdFromState = (location.state as { suggestionId?: string } | null)?.suggestionId;
    if (providerIdFromState || suggestionIdFromState) {
      const nextProviderId = providerIdFromState || providerFilterId;
      const nextSuggestionId = suggestionIdFromState || suggestionFilterId;
      setProviderFilterId(providerIdFromState ?? providerFilterId);
      if (suggestionIdFromState) setSuggestionFilterId(suggestionIdFromState);
      const params = new URLSearchParams();
      if (nextProviderId) params.set('providerId', nextProviderId);
      if (nextSuggestionId) params.set('suggestionId', nextSuggestionId);
      setSearchParams(params);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, setSearchParams, providerFilterId, suggestionFilterId]);

  useEffect(() => {
    if (!isSplitLayout) return;
    setCompactDetailView(false);
    if (categories.length === 0 || selectedCategoryId !== null) return;
    if (skipSelectNext.current) {
      skipSelectNext.current = false;
      return;
    }
    setSelectedCategoryId(categories[0].id);
  }, [categories, selectedCategoryId, isSplitLayout]);

  const filtered = useMemo(
    () =>
      categories.filter(
        (c) =>
          !searchQuery ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.id.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [categories, searchQuery],
  );

  const selected = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  useEffect(() => {
    if (!selected) return;
    setForm(categoryToForm(selected));
  }, [selected]);

  const filteredPendingSuggestions = useMemo(() => {
    return pendingSuggestions.filter((s) => {
      if (providerFilterId && s.providerId !== providerFilterId) return false;
      if (suggestionFilterId && s.id !== suggestionFilterId) return false;
      return true;
    });
  }, [pendingSuggestions, providerFilterId, suggestionFilterId]);

  useEffect(() => {
    const refreshSuggestions = () => void loadPendingSuggestions();
    socket.on('category_suggestion:created', refreshSuggestions);
    socket.on('category_suggestion:updated', refreshSuggestions);
    const intervalId = window.setInterval(() => {
      void loadPendingSuggestions();
    }, 30000);
    const onFocus = () => {
      void loadPendingSuggestions();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      socket.off('category_suggestion:created', refreshSuggestions);
      socket.off('category_suggestion:updated', refreshSuggestions);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadPendingSuggestions]);

  const syncSuggestionFiltersToUrl = (providerId: string, suggestionId: string) => {
    const params = new URLSearchParams();
    if (providerId) params.set('providerId', providerId);
    if (suggestionId) params.set('suggestionId', suggestionId);
    setSearchParams(params);
  };

  const startCreateCategory = () => {
    skipSelectNext.current = true;
    setSelectedCategoryId(null);
    setForm(EMPTY_CATEGORY_FORM);
    if (!isSplitLayout) setCompactDetailView(true);
  };

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    if (!isSplitLayout) setCompactDetailView(true);
  };

  const backToCategoryList = () => {
    setCompactDetailView(false);
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
        paymentMode: form.paymentMode,
        skills: parseSkillsCsv(form.skillsCsv),
        step3Type: form.step3Type,
        issueTypes: parseSkillsCsv(form.issueTypesCsv),
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
        paymentMode: form.paymentMode,
        skills: parseSkillsCsv(form.skillsCsv),
        step3Type: form.step3Type,
        issueTypes: parseSkillsCsv(form.issueTypesCsv),
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
      setSelectedCategoryId(remaining[0]?.id ?? null);
      if (!isSplitLayout) setCompactDetailView(false);
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

  const handleApproveSuggestion = async (id: string) => {
    setIsSaving(true);
    try {
      const suggestion = pendingSuggestions.find((s) => s.id === id);
      const result = await approveAdminCategorySuggestion(id, {
        serviceName: suggestion?.name || '',
        description: suggestion?.description || '',
        icon: suggestion?.icon || '🛠️',
      });
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

  const handleRejectSuggestion = async (id: string) => {
    setIsSaving(true);
    try {
      await rejectAdminCategorySuggestion(id);
      toast({ title: 'Suggestion rejected' });
      await loadPendingSuggestions();
    } catch (error) {
      toast({
        title: 'Reject failed',
        description: error instanceof Error ? error.message : 'Could not reject.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isCreateMode = !selected;
  const showCompactList = !isSplitLayout && !compactDetailView;
  const showCompactDetail = !isSplitLayout && compactDetailView;

  const editorPanel = (
    <CategoryEditorForm
      form={form}
      onFormChange={setForm}
      isCreateMode={isCreateMode}
      isSaving={isSaving}
      selectedCategory={selected}
      onSave={() => void handleSave()}
      onCreate={() => void handleCreate()}
      onDelete={() => void handleDelete()}
      onStartCreate={startCreateCategory}
      mobileHeader={
        showCompactDetail
          ? {
              title: isCreateMode ? 'New category' : selected?.name || 'Category',
              onBack: backToCategoryList,
            }
          : undefined
      }
    />
  );

  const suggestionsPanel = (
    <PendingCategorySuggestionsPanel
      suggestions={filteredPendingSuggestions}
      isLoading={suggestionsLoading}
      isSaving={isSaving}
      providerFilterId={providerFilterId}
      suggestionFilterId={suggestionFilterId}
      onProviderFilterChange={(value) => {
        setProviderFilterId(value);
        syncSuggestionFiltersToUrl(value, suggestionFilterId);
      }}
      onSuggestionFilterChange={(value) => {
        setSuggestionFilterId(value);
        syncSuggestionFiltersToUrl(providerFilterId, value);
      }}
      onRefresh={() => void loadPendingSuggestions()}
      onApprove={(id) => void handleApproveSuggestion(id)}
      onReject={(id) => void handleRejectSuggestion(id)}
    />
  );

  const categorySearch = (
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
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {showCompactList || isSplitLayout ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Service Categories</h1>
              <p className="text-muted-foreground">Manage categories used in user service requests</p>
            </div>
            <Button type="button" onClick={startCreateCategory} className="w-full sm:w-auto shrink-0">
              Create Category
            </Button>
          </div>
        ) : null}

        {(showCompactList || isSplitLayout) && (
          <CategoryStatsCards
            totalCategories={categories.length}
            pendingSuggestions={pendingSuggestions.length}
          />
        )}

        {isSplitLayout ? (
          <>
            {suggestionsPanel}
            {categorySearch}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <CategoryListCards
                  categories={filtered}
                  selectedCategoryId={selectedCategoryId}
                  onSelect={selectCategory}
                />
              </div>
              <div className="lg:col-span-2">{editorPanel}</div>
            </div>
          </>
        ) : showCompactList ? (
          <>
            {suggestionsPanel}
            {categorySearch}
            <CategoryListCards
              categories={filtered}
              selectedCategoryId={selectedCategoryId}
              onSelect={selectCategory}
            />
          </>
        ) : showCompactDetail ? (
          editorPanel
        ) : null}
      </div>
    </DashboardLayout>
  );
}
