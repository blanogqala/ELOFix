import { ArrowLeft, Tags, Trash2 } from 'lucide-react';
import type { Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { CategoryFormState } from './categoryForm';

type CategoryEditorFormProps = {
  form: CategoryFormState;
  onFormChange: (updater: (prev: CategoryFormState) => CategoryFormState) => void;
  isCreateMode: boolean;
  isSaving: boolean;
  selectedCategory: Category | null;
  onSave: () => void;
  onCreate: () => void;
  onDelete: () => void;
  onStartCreate: () => void;
  /** Compact layout: show back control and title above the form */
  mobileHeader?: {
    title: string;
    onBack: () => void;
  };
  className?: string;
};

export function CategoryEditorForm({
  form,
  onFormChange,
  isCreateMode,
  isSaving,
  selectedCategory,
  onSave,
  onCreate,
  onDelete,
  onStartCreate,
  mobileHeader,
  className,
}: CategoryEditorFormProps) {
  return (
    <div className={cn('card-elevated p-6 space-y-4', className)}>
      {mobileHeader ? (
        <div className="flex items-center gap-2 border-b border-border pb-4 -mt-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 -ml-1"
            onClick={mobileHeader.onBack}
            aria-label="Back to categories"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold truncate">{mobileHeader.title}</h2>
            {!isCreateMode && selectedCategory ? (
              <p className="text-xs text-muted-foreground truncate">{selectedCategory.id}</p>
            ) : (
              <p className="text-xs text-muted-foreground">New category</p>
            )}
          </div>
        </div>
      ) : null}

      {isCreateMode && !mobileHeader ? (
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
            onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-icon">Icon (emoji)</Label>
          <Input
            id="cat-icon"
            value={form.icon}
            onChange={(e) => onFormChange((f) => ({ ...f, icon: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cat-desc">Description</Label>
        <Input
          id="cat-desc"
          value={form.description}
          onChange={(e) => onFormChange((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cat-skills">Skills (comma separated)</Label>
          <Input
            id="cat-skills"
            value={form.skillsCsv}
            onChange={(e) => onFormChange((f) => ({ ...f, skillsCsv: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-issues">Issue types (comma separated)</Label>
          <Input
            id="cat-issues"
            value={form.issueTypesCsv}
            onChange={(e) => onFormChange((f) => ({ ...f, issueTypesCsv: e.target.value }))}
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
              onFormChange((f) => ({
                ...f,
                step3Type: e.target.value as Category['step3Type'],
              }))
            }
          >
            <option value="measurements">measurements</option>
            <option value="items">items</option>
            <option value="issue">issue</option>
            <option value="none">none</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-sort">Sort order</Label>
          <Input
            id="cat-sort"
            type="number"
            value={form.sortOrder}
            onChange={(e) => onFormChange((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="cat-req-mat"
            checked={form.requiresMaterials}
            onCheckedChange={(v) => onFormChange((f) => ({ ...f, requiresMaterials: Boolean(v) }))}
          />
          <Label htmlFor="cat-req-mat" className="font-normal cursor-pointer">
            Requires materials
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="cat-req-insp"
            checked={form.requiresInspection}
            onCheckedChange={(v) => onFormChange((f) => ({ ...f, requiresInspection: Boolean(v) }))}
          />
          <Label htmlFor="cat-req-insp" className="font-normal cursor-pointer">
            Requires inspection
          </Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={isCreateMode ? onCreate : onSave}
          disabled={isSaving}
        >
          {isCreateMode ? 'Save new category' : 'Save Changes'}
        </Button>
        <Button type="button" variant="outline" onClick={onStartCreate} disabled={isSaving}>
          Clear / new
        </Button>
        {!isCreateMode ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={isSaving}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
