import { useState } from 'react';
import { Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { JobStoreOrder, MaterialLine } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { MaterialCard } from '@/components/materials/MaterialCard';

export interface PendingMaterialsListProps {
  draftCardsByStore: Record<string, { storeName: string; items: MaterialLine[] }>;
  hasDraftMaterials: boolean;
  pendingOrders: JobStoreOrder[];
  materialRequests: MaterialRequestDto[];
  canEditMaterials: boolean;
  profileBlocksWorkflow: boolean;
  submitDisabled: boolean;
  onAddMaterials: () => void;
  onSubmitMaterials: () => void;
  onProviderCancelBatch?: (orderId: string) => Promise<void>;
  onDismissMaterialBatch?: (orderId: string) => Promise<void>;
}

export function PendingMaterialsList({
  draftCardsByStore,
  hasDraftMaterials,
  pendingOrders,
  materialRequests,
  canEditMaterials,
  profileBlocksWorkflow,
  submitDisabled,
  onAddMaterials,
  onSubmitMaterials,
  onProviderCancelBatch,
  onDismissMaterialBatch,
}: PendingMaterialsListProps) {
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const hasPendingOrders = pendingOrders.length > 0;
  const showEmpty = !hasDraftMaterials && !hasPendingOrders;

  const runDismiss = async (orderId: string) => {
    if (!onDismissMaterialBatch || !confirm('Remove this resolved listing from the job?')) return;
    setBusyOrderId(orderId);
    try {
      await onDismissMaterialBatch(orderId);
    } finally {
      setBusyOrderId(null);
    }
  };

  const runCancel = async (orderId: string) => {
    if (
      !onProviderCancelBatch ||
      !confirm('Cancel this listing? The customer will see it was cancelled.')
    ) {
      return;
    }
    setBusyOrderId(orderId);
    try {
      await onProviderCancelBatch(orderId);
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <div
      className="space-y-3 min-h-[4rem] animate-in fade-in duration-200"
      role="tabpanel"
      aria-label="Pending orders"
    >
      {hasDraftMaterials && (
        <>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Draft materials</h4>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {Object.entries(draftCardsByStore).map(([storeId, draft]) => {
              const total = draft.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
              return (
                <MaterialCard
                  key={`draft-${storeId}`}
                  status="draft"
                  supplierName={draft.storeName}
                  subtotal={total}
                  items={draft.items.map((item) => ({
                    rowKey: `draft-${storeId}-${item.productId}`,
                    name: item.name,
                    qty: item.qty,
                    lineTotal: item.qty * item.unitPrice,
                  }))}
                  meta={
                    <p className="text-xs text-muted-foreground">
                      Not sent to the user yet. Use Submit materials to user when ready.
                    </p>
                  }
                />
              );
            })}
          </div>
        </>
      )}

      {hasPendingOrders && (
        <>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Sent to customer (awaiting payment or resolved)
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingOrders.map((card) => {
              const total = card.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
              const batchMeta = card.materialRequestId
                ? materialRequests.find((r) => r.id === card.materialRequestId)
                : null;
              const resolution = card.materialBatchResolution;
              const isLegacy = card.orderId.startsWith('legacy-');
              const canCancelActive =
                Boolean(onProviderCancelBatch) &&
                canEditMaterials &&
                !resolution &&
                !Boolean(card.payment?.materialsPaid) &&
                !isLegacy &&
                !card.sourceUserSuggestionId;
              const canDismissResolved =
                Boolean(onDismissMaterialBatch) &&
                canEditMaterials &&
                !Boolean(card.payment?.materialsPaid) &&
                !isLegacy &&
                (resolution === 'rejected_by_customer' || resolution === 'cancelled_by_provider');

              return (
                <MaterialCard
                  key={card.orderId}
                  status="pending"
                  supplierName={card.storeName || card.storeId}
                  subtotal={total}
                  items={card.items.map((item) => ({
                    rowKey: `${card.orderId}-${item.productId}`,
                    name: item.name,
                    qty: item.qty,
                    lineTotal: item.qty * item.unitPrice,
                  }))}
                  meta={
                    <div className="space-y-2">
                      {resolution === 'rejected_by_customer' ? (
                        <Badge variant="destructive" className="text-[10px] w-fit">
                          Customer rejected this list
                        </Badge>
                      ) : null}
                      {resolution === 'cancelled_by_provider' ? (
                        <Badge variant="secondary" className="text-[10px] w-fit">
                          You cancelled this list
                        </Badge>
                      ) : null}
                      {batchMeta ? (
                        <p className="text-xs text-muted-foreground">
                          Request {batchMeta.status === 'submitted' ? 'awaiting payment' : batchMeta.status}{' '}
                          · {new Date(batchMeta.createdAt).toLocaleString()}
                        </p>
                      ) : undefined}
                      {card.sourceUserSuggestionId ? (
                        <p className="text-[11px] text-muted-foreground">
                          Manage customer suggestion batches under Customer suggested.
                        </p>
                      ) : null}
                    </div>
                  }
                  actions={
                    canDismissResolved || canCancelActive ? (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {canDismissResolved ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={busyOrderId === card.orderId}
                            onClick={() => void runDismiss(card.orderId)}
                          >
                            <Trash2 className="h-3 w-3 shrink-0" />
                            Remove listing
                          </Button>
                        ) : null}
                        {canCancelActive ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            disabled={busyOrderId === card.orderId}
                            onClick={() => void runCancel(card.orderId)}
                          >
                            <XCircle className="h-3 w-3 shrink-0" />
                            Cancel listing
                          </Button>
                        ) : null}
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </>
      )}

      {showEmpty && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-8 text-center">
          No pending materials. Add materials from stores or review customer suggestions.
        </p>
      )}

      {canEditMaterials && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onAddMaterials} variant="outline" disabled={profileBlocksWorkflow}>
            Add / edit materials
          </Button>
          <Button onClick={onSubmitMaterials} disabled={profileBlocksWorkflow || submitDisabled}>
            Submit materials to user
          </Button>
        </div>
      )}
    </div>
  );
}
