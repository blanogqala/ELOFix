import { Check, Trash2, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { JobStoreOrder, UserMaterialSuggestion } from '@/types';
import { MaterialCard } from '@/components/materials/MaterialCard';
import {
  getUserSuggestionItems,
  getUserSuggestionStoreInfo,
  getUserSuggestionSubtotal,
} from '@/lib/userMaterialSuggestions';

export interface CustomerSuggestionsListProps {
  suggestions: UserMaterialSuggestion[];
  getPendingOrderForAcceptedSuggestion: (
    suggestion: UserMaterialSuggestion
  ) => JobStoreOrder | undefined;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  /** Revoke acceptance before the customer pays (removes unpaid checkout batch). */
  onWithdrawAccepted?: (id: string) => void | Promise<void>;
  /** Permanently remove a withdrawn-after-accept record from meta. */
  onPurgeWithdrawn?: (id: string) => void | Promise<void>;
}

function isPaidOrder(order?: JobStoreOrder): boolean {
  if (!order) return false;
  return Boolean(order.payment?.materialsPaid);
}

export function CustomerSuggestionsList({
  suggestions,
  getPendingOrderForAcceptedSuggestion,
  onAccept,
  onReject,
  onWithdrawAccepted,
  onPurgeWithdrawn,
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
          const items = getUserSuggestionItems(s);
          const { storeName } = getUserSuggestionStoreInfo(s);
          const subtotal = getUserSuggestionSubtotal(s);
          const linked = getPendingOrderForAcceptedSuggestion(s);
          const st = String(s.status || '').toLowerCase();
          const isPending = st === 'pending';
          const withdrawnRecord = Boolean(s.withdrawnAfterAccept) && st === 'rejected';

          const canRevokeAccepted =
            Boolean(onWithdrawAccepted) &&
            st === 'accepted' &&
            !!linked &&
            !isPaidOrder(linked);

          const canPurgeWithdrawn = Boolean(onPurgeWithdrawn) && withdrawnRecord;

          const withdrawnCaption =
            s.withdrawnBy === 'customer'
              ? 'Customer withdrew before paying.'
              : s.withdrawnBy === 'provider'
                ? 'You revoked acceptance (unpaid checkout removed).'
                : 'Suggestion withdrawn';

          return (
            <MaterialCard
              key={s.id}
              status={isPending ? 'suggested' : withdrawnRecord ? 'pending' : 'approved'}
              supplierName={storeName}
              subtotal={subtotal}
              items={items.map((line) => ({
                rowKey: `${s.id}-${line.productId}`,
                name: line.name,
                qty: line.qty,
                lineTotal: line.qty * line.unitPrice,
              }))}
              meta={
                <>
                  {s.message ? <p className="text-sm text-muted-foreground">{s.message}</p> : null}
                  {withdrawnRecord ? (
                    <Badge variant="outline" className="text-[11px]">
                      {withdrawnCaption}
                    </Badge>
                  ) : null}
                  {!withdrawnRecord && !isPending && linked ? (
                    <p className="text-xs text-muted-foreground">
                      Linked order awaiting customer payment
                      {linked.orderId ? ` · ${linked.orderId.slice(-8)}` : ''}.
                    </p>
                  ) : null}
                  {!withdrawnRecord && !isPending && st === 'accepted' && !linked ? (
                    <p className="text-xs text-amber-600">
                      Accepted — awaiting checkout batch (refresh if this persists).
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
                ) : withdrawnRecord ? (
                  canPurgeWithdrawn ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => void onPurgeWithdrawn?.(s.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove record
                    </Button>
                  ) : undefined
                ) : canRevokeAccepted ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    onClick={() => void onWithdrawAccepted?.(s.id)}
                  >
                    <XCircle className="h-3 w-3" />
                    Revoke acceptance
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
