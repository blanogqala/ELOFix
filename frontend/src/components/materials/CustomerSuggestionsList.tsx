import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { JobStoreOrder, UserMaterialSuggestion } from '@/types';
import { MaterialCard } from '@/components/materials/MaterialCard';

export interface CustomerSuggestionsListProps {
  suggestions: UserMaterialSuggestion[];
  getPendingOrderForAcceptedSuggestion: (
    suggestion: UserMaterialSuggestion
  ) => JobStoreOrder | undefined;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function CustomerSuggestionsList({
  suggestions,
  getPendingOrderForAcceptedSuggestion,
  onAccept,
  onReject,
}: CustomerSuggestionsListProps) {
  if (suggestions.length === 0) {
    return (
      <div
        className="min-h-[4rem] animate-in fade-in duration-200 rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
        role="tabpanel"
        aria-label="Customer suggestions"
      >
        No suggestions available.
      </div>
    );
  }

  return (
    <div
      className="space-y-3 min-h-[4rem] animate-in fade-in duration-200"
      role="tabpanel"
      aria-label="Customer suggestions"
    >
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {suggestions.map((s) => {
          const line = s.suggested;
          const subtotal = line.qty * line.unitPrice;
          const linked = getPendingOrderForAcceptedSuggestion(s);
          const isPending = s.status === 'pending';

          return (
            <MaterialCard
              key={s.id}
              status={s.status === 'pending' ? 'suggested' : 'approved'}
              supplierName={line.supplierName}
              subtotal={subtotal}
              items={[
                {
                  rowKey: s.id,
                  name: line.name,
                  qty: line.qty,
                  lineTotal: subtotal,
                },
              ]}
              meta={
                <>
                  {s.message ? <p className="text-sm text-muted-foreground">{s.message}</p> : null}
                  {!isPending && linked ? (
                    <p className="text-xs text-muted-foreground">
                      Linked order awaiting customer payment
                      {linked.orderId ? ` · ${linked.orderId.slice(-8)}` : ''}.
                    </p>
                  ) : null}
                </>
              }
              actions={
                isPending ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onReject(s.id)} aria-label="Reject suggestion">
                      <X className="h-3 w-3" />
                    </Button>
                    <Button size="sm" onClick={() => onAccept(s.id)} aria-label="Accept suggestion">
                      <Check className="h-3 w-3" />
                    </Button>
                  </>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
