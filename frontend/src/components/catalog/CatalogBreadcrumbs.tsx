import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CatalogBreadcrumbs({
  items,
  onBack,
  backLabel = 'Back to categories',
}: {
  items: Array<{ label: string; onClick?: () => void }>;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onBack && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
      )}
      <nav aria-label="Catalogue" className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <span key={`${item.label}-${i}`} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {item.onClick ? (
              <button type="button" className="truncate hover:text-foreground" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span className="truncate font-medium text-foreground">{item.label}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
