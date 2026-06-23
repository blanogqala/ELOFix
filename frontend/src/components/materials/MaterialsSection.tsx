import { useState } from 'react';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Job, JobStoreOrder, MaterialLine } from '@/types';
import type { MaterialRequestDto } from '@/lib/api/materialRequests';
import { MaterialBatches } from '@/components/materials/MaterialBatches';
import { MaterialTabs, type MaterialsTabId } from '@/components/materials/MaterialTabs';
import { PendingMaterialsList } from '@/components/materials/PendingMaterialsList';
import { CustomerSuggestionsList } from '@/components/materials/CustomerSuggestionsList';
import { isMaterialOrderRefunded } from '@/lib/materialBatchTracking';
import { resolveMaterialOrderForStoreOrder } from '@/lib/providerMaterialOrderHelpers';

export interface MaterialsSectionProps {
  job: Job;
  materialRequests: MaterialRequestDto[];
  /** Paid store orders only, sorted consistently with job workflow */
  paidBatches: JobStoreOrder[];
  /** Unpaid store orders (all pending checkout cycles, including suggestion-backed) */
  pendingOrders: JobStoreOrder[];
  draftCardsByStore: Record<string, { storeName: string; items: MaterialLine[] }>;
  hasDraftMaterials: boolean;
  hasSubmittedMaterialRequests: boolean;
  customerSuggestionsForDisplay: NonNullable<Job['userMaterialSuggestions']>;
  getPendingOrderForAcceptedSuggestion: (
    suggestion: NonNullable<Job['userMaterialSuggestions']>[number]
  ) => JobStoreOrder | undefined;
  allMaterialsPaid: boolean;
  hasAnyMaterialPaid: boolean;
  canEditMaterials: boolean;
  profileBlocksWorkflow: boolean;
  materialsBuilder: MaterialLine[];
  draftMrFromApi: MaterialRequestDto | undefined;
  onNavigateProfile: () => void;
  onAddMaterials: () => void;
  onSubmitMaterials: () => void;
  onAcceptSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onWithdrawAcceptedSuggestion?: (suggestionId: string) => void | Promise<void>;
  onPurgeWithdrawnSuggestion?: (suggestionId: string) => void | Promise<void>;
  onProviderCancelBatch?: (orderId: string) => void | Promise<void>;
  onDismissMaterialBatch?: (orderId: string) => void | Promise<void>;
}

export function MaterialsSection({
  job,
  materialRequests,
  paidBatches,
  pendingOrders,
  draftCardsByStore,
  hasDraftMaterials,
  hasSubmittedMaterialRequests,
  customerSuggestionsForDisplay,
  getPendingOrderForAcceptedSuggestion,
  allMaterialsPaid,
  hasAnyMaterialPaid: _hasAnyMaterialPaid,
  canEditMaterials,
  profileBlocksWorkflow,
  materialsBuilder,
  draftMrFromApi,
  onNavigateProfile,
  onAddMaterials,
  onSubmitMaterials,
  onAcceptSuggestion,
  onRejectSuggestion,
  onWithdrawAcceptedSuggestion,
  onPurgeWithdrawnSuggestion,
  onProviderCancelBatch,
  onDismissMaterialBatch,
}: MaterialsSectionProps) {
  const [activeTab, setActiveTab] = useState<MaterialsTabId>('pending');
  const suggestionCount = customerSuggestionsForDisplay.length;
  const submitDisabled = materialsBuilder.length === 0 && !draftMrFromApi;
  const hasRefundedMaterial = paidBatches.some((card) =>
    isMaterialOrderRefunded(resolveMaterialOrderForStoreOrder(job, card))
  );
  const hasActiveMaterialPaid = paidBatches.some(
    (card) =>
      card.payment?.materialsPaid &&
      !isMaterialOrderRefunded(resolveMaterialOrderForStoreOrder(job, card))
  );

  if (!job.servicePrice || !job.laborPaid) {
    return (
      <div className="card-elevated p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Package className="h-5 w-5" /> Materials
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Submit service price and wait for user payment before adding materials.
        </p>
      </div>
    );
  }

  return (
    <div className="card-elevated p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Package className="h-5 w-5" /> Materials
        </h2>
        {hasRefundedMaterial && !hasActiveMaterialPaid ? (
          <Badge variant="destructive">Refund issued</Badge>
        ) : allMaterialsPaid && hasActiveMaterialPaid ? (
          <Badge className="bg-green-600 text-white">Paid</Badge>
        ) : null}
      </div>

      {hasRefundedMaterial && !hasActiveMaterialPaid && (
        <p className="text-sm text-destructive font-medium">
          A material order was cancelled and refunded to the customer.
        </p>
      )}
      {hasActiveMaterialPaid && (
        <p className="text-sm text-green-600 font-medium">
          User has completed material purchase for this job. You can proceed with the work.
        </p>
      )}

      {profileBlocksWorkflow && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">
          Complete your profile to add or submit materials.{' '}
          <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={onNavigateProfile}>
            Open profile
          </Button>
        </div>
      )}

      <MaterialBatches
        job={job}
        paidBatches={paidBatches}
        materialRequests={materialRequests}
        hasSubmittedMaterialRequests={hasSubmittedMaterialRequests}
      />

      <div className="pt-2 border-t border-border space-y-3">
        <MaterialTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          suggestionCount={suggestionCount}
        />

        <div className="relative">
          {activeTab === 'pending' ? (
            <PendingMaterialsList
              draftCardsByStore={draftCardsByStore}
              hasDraftMaterials={hasDraftMaterials}
              pendingOrders={pendingOrders}
              materialRequests={materialRequests}
              canEditMaterials={canEditMaterials}
              profileBlocksWorkflow={profileBlocksWorkflow}
              submitDisabled={submitDisabled}
              onAddMaterials={onAddMaterials}
              onSubmitMaterials={onSubmitMaterials}
              onProviderCancelBatch={onProviderCancelBatch}
              onDismissMaterialBatch={onDismissMaterialBatch}
            />
          ) : (
            <CustomerSuggestionsList
              suggestions={customerSuggestionsForDisplay}
              getPendingOrderForAcceptedSuggestion={getPendingOrderForAcceptedSuggestion}
              onAccept={onAcceptSuggestion}
              onReject={onRejectSuggestion}
              onWithdrawAccepted={onWithdrawAcceptedSuggestion}
              onPurgeWithdrawn={onPurgeWithdrawnSuggestion}
            />
          )}
        </div>
      </div>

      {hasActiveMaterialPaid && (
        <p className="text-xs text-muted-foreground">
          Materials paid for one or more stores. You can still add new material batches.
        </p>
      )}
    </div>
  );
}
