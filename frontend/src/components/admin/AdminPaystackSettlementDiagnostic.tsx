import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  getAdminPaystackSettlementDiagnostic,
  type AdminPaystackSettlementDiagnostic,
} from '@/lib/api/adminFinancial';

type Props = {
  merchantReference?: string | null;
  paymentIntentId?: string | null;
  gateway?: string | null;
};

export function AdminPaystackSettlementDiagnostic({
  merchantReference,
  paymentIntentId,
  gateway,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdminPaystackSettlementDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (String(gateway || '').toUpperCase() !== 'PAYSTACK') return null;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminPaystackSettlementDiagnostic({
        reference: merchantReference || undefined,
        paymentIntentId: paymentIntentId || undefined,
      });
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Diagnostic failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? 'Running diagnostic…' : 'Paystack settlement diagnostic'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {result ? (
        <pre className="text-[10px] whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-muted-foreground">
          {JSON.stringify(
            {
              paymentIntentId: result.paymentIntentId,
              merchantReference: result.merchantReference,
              paymentState: result.paymentState,
              storedPayoutSettlementStatus: result.storedPayoutSettlementStatus,
              storedPayoutSettlementId: result.storedPayoutSettlementId,
              historicalSubaccountCode: result.historicalSubaccountCode,
              resolvedNumericSubaccountId: result.resolvedNumericSubaccountId,
              settlementQuery: result.settlementQuery,
              settlements: result.settlements,
              reconciliationDecision: result.reconciliationDecision,
              skipReason: result.skipReason,
              apiError: result.apiError,
            },
            null,
            2
          )}
        </pre>
      ) : null}
    </div>
  );
}
