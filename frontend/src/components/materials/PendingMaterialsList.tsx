import { Button } from '@/components/ui/button';
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
}: PendingMaterialsListProps) {
  const hasPendingOrders = pendingOrders.length > 0;
  const showEmpty = !hasDraftMaterials && !hasPendingOrders;

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
            Awaiting customer payment
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingOrders.map((card) => {
              const total = card.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
              const batchMeta = card.materialRequestId
                ? materialRequests.find((r) => r.id === card.materialRequestId)
                : null;

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
                    batchMeta ? (
                      <p className="text-xs text-muted-foreground">
                        Request {batchMeta.status === 'submitted' ? 'awaiting payment' : batchMeta.status}{' '}
                        · {new Date(batchMeta.createdAt).toLocaleString()}
                      </p>
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
