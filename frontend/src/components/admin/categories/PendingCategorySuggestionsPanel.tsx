import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminCategorySuggestion } from '@/lib/api/adminCategories';

type PendingCategorySuggestionsPanelProps = {
  suggestions: AdminCategorySuggestion[];
  isLoading: boolean;
  isSaving: boolean;
  providerFilterId: string;
  suggestionFilterId: string;
  onProviderFilterChange: (value: string) => void;
  onSuggestionFilterChange: (value: string) => void;
  onRefresh: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

export function PendingCategorySuggestionsPanel({
  suggestions,
  isLoading,
  isSaving,
  providerFilterId,
  suggestionFilterId,
  onProviderFilterChange,
  onSuggestionFilterChange,
  onRefresh,
  onApprove,
  onReject,
}: PendingCategorySuggestionsPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Pending category suggestions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Filter by provider id"
            value={providerFilterId}
            onChange={(e) => onProviderFilterChange(e.target.value.trim())}
            className="h-8 w-full sm:w-56"
          />
          <Input
            placeholder="Filter by suggestion id"
            value={suggestionFilterId}
            onChange={(e) => onSuggestionFilterChange(e.target.value.trim())}
            className="h-8 w-full sm:w-56"
          />
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground mt-2">Loading…</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-2">No pending suggestions</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {suggestions.map((s) => (
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
                <p className="text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => onApprove(s.id)}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={isSaving}
                  onClick={() => onReject(s.id)}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
