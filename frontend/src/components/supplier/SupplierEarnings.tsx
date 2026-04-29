import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupplierOrders, type SupplierMaterialOrderLine } from '@/lib/api/supplierPortal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

function isPurchaseRow(o: SupplierMaterialOrderLine): boolean {
  const fulfilled = String(o.fulfillmentStatus || '').toUpperCase() === 'COMPLETED';
  const paid = String(o.paymentStatus || 'paid').toLowerCase() === 'paid';
  return fulfilled && paid;
}

function parseOrderLine(line: Record<string, unknown>): {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
} {
  const qty = Number(line.qty ?? line.quantity ?? 0);
  const unitPrice = Number(line.unitPrice ?? line.price ?? 0);
  const name = String(line.name ?? 'Item');
  return {
    name,
    qty: Number.isFinite(qty) ? qty : 0,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    lineTotal: (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0),
  };
}

export function SupplierEarnings({ userId }: { userId: string }) {
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['supplier', 'orders', userId],
    queryFn: () => getSupplierOrders(),
    enabled: Boolean(userId),
  });

  const purchases = useMemo(() => orders.filter(isPurchaseRow), [orders]);

  const detail = useMemo(
    () => (detailId ? purchases.find((o) => o.id === detailId) ?? null : null),
    [detailId, purchases]
  );

  const summary = useMemo(() => {
    let totalRevenue = 0;
    let platform = 0;
    let net = 0;
    for (const o of purchases) {
      totalRevenue += Number(o.materialsSubtotal ?? 0);
      platform += Number(o.platformCommission ?? 0);
      net += Number(o.supplierEarning ?? 0);
    }
    return { totalRevenue, platform, net };
  }, [purchases]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading earnings…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.totalRevenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Materials subtotal · completed & paid</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Platform commission (7%)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.platform)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(summary.net)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Your share (93%)</p>
          </CardContent>
        </Card>
      </div>

      {detail && (
        <div className="space-y-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-muted-foreground"
            onClick={() => setDetailId(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to purchases
          </Button>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-lg">Purchase details</CardTitle>
              <p className="text-xs font-mono text-muted-foreground">Order ID: {detail.id}</p>
              <p className="text-base font-semibold">{detail.customerName || detail.customerEmail || 'Customer'}</p>
              <p className="text-xs text-muted-foreground">
                {detail.createdAt
                  ? new Date(detail.createdAt).toLocaleString(undefined, {
                      dateStyle: 'full',
                      timeStyle: 'short',
                    })
                  : '—'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="col-span-5">Item</span>
                  <span className="col-span-2 text-right">Qty</span>
                  <span className="col-span-3 text-right">Price</span>
                  <span className="col-span-2 text-right">Line</span>
                </div>
                <ul className="divide-y divide-border">
                  {(Array.isArray(detail.items) ? detail.items : []).map((raw, idx) => {
                    const line = parseOrderLine(raw as Record<string, unknown>);
                    const key =
                      String((raw as { productId?: string }).productId ?? '') ||
                      `${line.name}-${idx}`;
                    return (
                      <li key={key} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-sm">
                        <span className="col-span-5 font-medium">{line.name}</span>
                        <span className="col-span-2 text-right tabular-nums">{line.qty}</span>
                        <span className="col-span-3 text-right tabular-nums">{formatCurrency(line.unitPrice)}</span>
                        <span className="col-span-2 text-right tabular-nums font-medium">
                          {formatCurrency(line.lineTotal)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-1 rounded-md bg-muted/30 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Materials subtotal</span>
                  <span className="tabular-nums">{formatCurrency(Number(detail.materialsSubtotal ?? 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform commission</span>
                  <span className="tabular-nums">{formatCurrency(Number(detail.platformCommission ?? 0))}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Your earnings</span>
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(Number(detail.supplierEarning ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Order total (incl. delivery if any)</span>
                  <span className="tabular-nums">{formatCurrency(Number(detail.total ?? detail.materialsSubtotal ?? 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!detail && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Purchases</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card card-elevated">
            <div className="grid grid-cols-12 gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="col-span-4">Customer</span>
              <span className="col-span-2 text-right">Items</span>
              <span className="col-span-3 text-right">Total amount</span>
              <span className="col-span-3 text-right">Date</span>
            </div>
            <ul className="divide-y divide-border">
              {purchases.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">No completed purchases yet.</li>
              ) : (
                purchases.map((o) => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const count = items.reduce(
                    (acc, line) =>
                      acc +
                      Number(
                        (line as { qty?: number; quantity?: number }).qty ??
                          (line as { quantity?: number }).quantity ??
                          0
                      ),
                    0
                  );
                  const total = Number(o.total ?? o.materialsSubtotal ?? 0);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        className={cn(
                          'grid w-full grid-cols-12 gap-2 px-4 py-3 text-left text-sm',
                          'cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        )}
                        onClick={() => setDetailId(o.id)}
                      >
                        <span className="col-span-4 truncate font-medium">
                          {o.customerName || o.customerEmail || '—'}
                        </span>
                        <span className="col-span-2 text-right tabular-nums">{count}</span>
                        <span className="col-span-3 text-right tabular-nums font-medium">{formatCurrency(total)}</span>
                        <span className="col-span-3 text-right text-muted-foreground tabular-nums">
                          {o.createdAt
                            ? new Date(o.createdAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
