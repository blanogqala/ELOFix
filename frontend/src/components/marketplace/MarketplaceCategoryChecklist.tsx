import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export type ChecklistCategory = {
  id: string;
  name: string;
  isActive?: boolean;
};

export function MarketplaceCategoryChecklist({
  categories,
  selectedIds,
  onChange,
  disabled,
  showInactive = false,
}: {
  categories: ChecklistCategory[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  showInactive?: boolean;
}) {
  const visible = showInactive ? categories : categories.filter((category) => category.isActive !== false);
  const selected = visible.filter((category) => selectedIds.includes(category.id));

  const toggle = (id: string, checked: boolean) => {
    if (checked) onChange([...new Set([...selectedIds, id])]);
    else onChange(selectedIds.filter((value) => value !== id));
  };

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No marketplace categories are available yet.</p>;
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((category) => (
            <Badge key={category.id} variant="secondary" className="font-normal">
              {category.name}
              {category.isActive === false ? ' (inactive)' : ''}
            </Badge>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((category) => {
          const checked = selectedIds.includes(category.id);
          return (
            <label
              key={category.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm',
                'hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => toggle(category.id, value === true)}
                aria-label={category.name}
              />
              <span className="min-w-0 break-words">
                {category.name}
                {category.isActive === false ? (
                  <span className="ml-1 text-xs text-muted-foreground">Inactive</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
