import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getInvoices } from '@/lib/api/payments';
import { getJobsByUser } from '@/lib/api/jobs';
import { Invoice } from '@/types';
import {
  FileText,
  Download,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  CreditCard,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { format, parseISO } from 'date-fns';
import {
  groupPaymentInvoices,
  invoiceDisplayLabel,
  invoiceMatchesPaymentLocator,
  invoiceStatusLabel,
  isPaymentInvoice,
  isRefundInvoice,
  type PaymentHistoryGroup,
} from '@/lib/customerPaymentHistory';

type TabType = 'payments' | 'refunds';

function safePaidAt(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

export default function UserPayments() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const userId = user?.id;
  const paymentLocator = (searchParams.get('payment') || searchParams.get('invoice') || '').trim();
  const [activeTab, setActiveTab] = useState<TabType>('payments');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<{ id: string; categoryName: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [invoicesData, jobsData] = await Promise.all([
        getInvoices(userId),
        getJobsByUser(userId),
      ]);
      setInvoices(
        invoicesData.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      );
      setJobs(jobsData.map((j) => ({ id: j.id, categoryName: j.categoryName })));
    } catch (error) {
      console.error('Failed to load payment data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void loadData();
    }
  }, [userId, loadData]);

  useEffect(() => {
    if (!paymentLocator || invoices.length === 0) return;
    const match = invoices.find((invoice) => invoiceMatchesPaymentLocator(invoice, paymentLocator));
    if (!match) return;
    setActiveTab(isRefundInvoice(match) ? 'refunds' : 'payments');
    setSelectedInvoice(match);
  }, [paymentLocator, invoices]);

  const paymentInvoices = useMemo(() => invoices.filter(isPaymentInvoice), [invoices]);
  const refundInvoices = useMemo(() => invoices.filter(isRefundInvoice), [invoices]);
  const paymentGroups = useMemo(
    () => groupPaymentInvoices(paymentInvoices, jobs),
    [paymentInvoices, jobs]
  );
  const refundGroups = useMemo(
    () => groupPaymentInvoices(refundInvoices, jobs),
    [refundInvoices, jobs]
  );

  const getStatusIcon = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'partially_refunded':
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'refunded':
        return <RotateCcw className="h-4 w-4 text-primary" />;
    }
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #0A2540; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; }
          .total { font-weight: bold; font-size: 1.2em; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
          .paid { background: #d4edda; color: #155724; }
          .refunded { background: #cce5ff; color: #004085; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>EloFix Invoice</h1>
            <p>Invoice ID: ${invoice.id}</p>
            <p>Reference: ${invoice.jobId}</p>
            ${invoice.driverName ? `<p>Driver: ${invoice.driverName}</p>` : ''}
            ${invoice.vehicleInfo ? `<p>Vehicle: ${invoice.vehicleInfo}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <p>Date: ${format(parseISO(invoice.paidAt), 'PPP')}</p>
            <span class="status ${invoice.status}">${invoiceStatusLabel(invoice.status)}</span>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.lineItems.map(item => `
              <tr>
                <td>${item.description}${item.supplierName ? ` (${item.supplierName})` : ''}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice, { decimals: 2 })}</td>
                <td>${formatCurrency(item.total, { decimals: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total">
              <td colspan="3">Total</td>
              <td>${formatCurrency(invoice.totalAmount, { decimals: 2 })}</td>
            </tr>
            ${invoice.refundedAmount ? `
              <tr>
                <td colspan="3">Refunded</td>
                <td>-${formatCurrency(invoice.refundedAmount, { decimals: 2 })}</td>
              </tr>
            ` : ''}
          </tfoot>
        </table>
        
        <p><strong>Payment Method:</strong> ${invoice.paymentMethod}${invoice.cardLast4 ? ` ending in ${invoice.cardLast4}` : ''}</p>
        
        <script>window.print();</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const renderGroup = (group: PaymentHistoryGroup, refundStyle: boolean) => (
    <div key={group.key} className="card-elevated min-w-0 max-w-full overflow-hidden">
      <div className="flex min-w-0 flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{group.title}</h3>
          <p className="break-all text-xs text-muted-foreground">{group.subtitle}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {group.invoices.length} {group.invoices.length === 1 ? 'payment' : 'payments'}
          </span>
          <span className={cn('font-medium tabular-nums', refundStyle && 'text-success')}>
            {refundStyle ? '+' : ''}
            {formatCurrency(group.totalPaid, { decimals: 2 })}
            {refundStyle ? '' : ' total paid'}
          </span>
          {group.kind === 'job' && group.key.includes(':') ? (
            <Button variant="link" className="h-auto p-0 text-xs" asChild>
              <Link to={`/user/jobs/${group.key.slice(group.key.indexOf(':') + 1)}`}>Open job</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="divide-y divide-border">
        {group.invoices.map((invoice) => {
          const isHighlighted =
            Boolean(paymentLocator) && invoiceMatchesPaymentLocator(invoice, paymentLocator);
          return (
          <div
            key={invoice.id}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between',
              isHighlighted && 'bg-secondary/70 ring-2 ring-inset ring-primary/30'
            )}
            aria-current={isHighlighted ? 'true' : undefined}
            onClick={() => setSelectedInvoice(invoice)}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  refundStyle ? 'bg-success/10' : 'bg-primary/10'
                )}
              >
                {refundStyle ? (
                  <RotateCcw className="h-4 w-4 text-success" />
                ) : (
                  <Receipt className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="break-words font-medium">
                  {refundStyle ? `Refund · ${group.title}` : invoiceDisplayLabel(invoice, group.kind)}
                </p>
                <p className="text-sm text-muted-foreground">{safePaidAt(invoice.paidAt)}</p>
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
              <div className="min-w-0 text-left sm:text-right">
                <p
                  className={cn(
                    'font-semibold tabular-nums',
                    refundStyle ? 'text-success' : 'text-foreground'
                  )}
                >
                  {refundStyle ? '+' : ''}
                  {formatCurrency(invoice.totalAmount, { decimals: 2 })}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {getStatusIcon(invoice.status)}
                  <span>{refundStyle ? 'Refunded' : invoiceStatusLabel(invoice.status)}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedInvoice(invoice);
                }}
              >
                View invoice
              </Button>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
          <div className="card-elevated p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Payments</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            View your payments, invoices and refunds.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Payment history sections"
          className="grid w-full grid-cols-2 border-b border-border"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'payments'}
            onClick={() => setActiveTab('payments')}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-center text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm',
              activeTab === 'payments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="truncate">Payments</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'refunds'}
            onClick={() => setActiveTab('refunds')}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-center text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm',
              activeTab === 'refunds'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate sm:hidden">Refunds</span>
            <span className="hidden truncate sm:inline">Refund Invoices</span>
          </button>
        </div>

        {activeTab === 'payments' && (
          <div className="space-y-4">
            {paymentGroups.length === 0 ? (
              <div className="card-elevated p-12 text-center">
                <Receipt className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold">No payments yet</h3>
                <p className="text-sm text-muted-foreground">
                  Paid service jobs and material orders will appear here.
                </p>
              </div>
            ) : (
              paymentGroups.map((group) => renderGroup(group, false))
            )}
          </div>
        )}

        {activeTab === 'refunds' && (
          <div className="space-y-4">
            {refundGroups.length === 0 ? (
              <div className="card-elevated p-12 text-center">
                <RotateCcw className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 font-semibold">No refunds yet</h3>
                <p className="text-sm text-muted-foreground">
                  Completed refunds for your jobs will appear here
                </p>
              </div>
            ) : (
              refundGroups.map((group) => renderGroup(group, true))
            )}
          </div>
        )}

        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="max-h-[min(90dvh,40rem)] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
            </DialogHeader>
            {selectedInvoice && (
              <div className="min-w-0 max-w-full space-y-4 pt-2">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Invoice ID</p>
                    <p className="break-all font-medium">{selectedInvoice.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {getStatusIcon(selectedInvoice.status)}
                    <span className="text-sm font-medium">{invoiceStatusLabel(selectedInvoice.status)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Job Reference</p>
                    <p className="break-all font-medium">{selectedInvoice.jobId || '—'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Payment Date</p>
                    <p className="break-words font-medium">
                      {format(parseISO(selectedInvoice.paidAt), 'PPP')}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Payment Method</p>
                    <p className="break-words font-medium">{selectedInvoice.paymentMethod}</p>
                  </div>
                  {selectedInvoice.cardLast4 && (
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Card</p>
                      <p className="font-medium">•••• {selectedInvoice.cardLast4}</p>
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <h4 className="mb-2 font-medium">Cost Breakdown</h4>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    {selectedInvoice.lineItems.map((item, idx) => (
                      <div key={idx} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words text-muted-foreground">
                          {item.description}
                          {item.quantity > 1 && ` (x${item.quantity})`}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatCurrency(item.total, { decimals: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="mt-2 flex min-w-0 items-start justify-between gap-3 border-t border-border pt-2 font-medium">
                      <span>Total</span>
                      <span className="shrink-0 tabular-nums">
                        {formatCurrency(selectedInvoice.totalAmount, { decimals: 2 })}
                      </span>
                    </div>
                    {selectedInvoice.refundedAmount ? (
                      <div className="flex min-w-0 items-start justify-between gap-3 text-success">
                        <span>Refunded</span>
                        <span className="shrink-0 tabular-nums">
                          -{formatCurrency(selectedInvoice.refundedAmount, { decimals: 2 })}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedInvoice.hardwareStores && selectedInvoice.hardwareStores.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Hardware Stores</p>
                    <p className="break-words font-medium">{selectedInvoice.hardwareStores.join(', ')}</p>
                  </div>
                )}
                {selectedInvoice.driverName && (
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Driver</p>
                    <p className="break-words font-medium">{selectedInvoice.driverName}</p>
                  </div>
                )}
                {selectedInvoice.vehicleInfo && (
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="break-words font-medium">{selectedInvoice.vehicleInfo}</p>
                  </div>
                )}

                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Invoice
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
