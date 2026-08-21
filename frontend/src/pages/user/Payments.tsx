import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getSavedCards, deleteCard, getInvoices } from '@/lib/api/payments';
import { getJobsByUser } from '@/lib/api/jobs';
import { SavedCard, Invoice } from '@/types';
import { 
  CreditCard, 
  Trash2, 
  FileText,
  Download,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { format, parseISO } from 'date-fns';

type TabType = 'methods' | 'invoices';

function isRefundInvoice(invoice: Invoice): boolean {
  const type = String(invoice.type || '').toLowerCase();
  const status = String(invoice.status || '').toLowerCase();
  return type === 'refund' || status === 'refunded' || status === 'partially_refunded';
}

export default function UserPayments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('methods');
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<{ id: string; categoryName: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [cardsData, invoicesData, jobsData] = await Promise.all([
        getSavedCards(user.id),
        getInvoices(user.id),
        getJobsByUser(user.id),
      ]);
      setCards(cardsData);
      setInvoices(invoicesData.sort((a, b) => 
        new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
      ));
      setJobs(jobsData.map(j => ({ id: j.id, categoryName: j.categoryName })));
    } catch (error) {
      console.error('Failed to load payment data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user, loadData]);

  const handleDeleteLegacyCard = async (cardId: string) => {
    if (!user) return;
    try {
      await deleteCard(user.id, cardId);
      await loadData();
      toast({ title: 'Removed', description: 'Legacy card metadata was deleted.' });
    } catch {
      toast({ title: 'Failed to remove', variant: 'destructive' });
    }
  };

  const groupInvoicesByJob = (invoices: Invoice[]) => {
    const byJob = new Map<string, Invoice[]>();
    invoices.forEach(inv => {
      const key = inv.jobId;
      if (!byJob.has(key)) byJob.set(key, []);
      byJob.get(key)!.push(inv);
    });
    return Array.from(byJob.entries()).map(([jobId, invs]) => {
      const job = jobs.find(j => j.id === jobId);
      const label = job ? job.categoryName : (invs[0]?.hardwareStores?.[0] || `Order #${jobId.slice(-8)}`);
      return { jobId, label, invoices: invs.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()) };
    }).sort((a, b) => {
      const aLatest = Math.max(...a.invoices.map(i => new Date(i.paidAt).getTime()));
      const bLatest = Math.max(...b.invoices.map(i => new Date(i.paidAt).getTime()));
      return bLatest - aLatest;
    });
  };

  const getStatusIcon = (status: Invoice['status']) => {
    switch (status) {
      case 'paid': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'partially_refunded': return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'refunded': return <RotateCcw className="h-4 w-4 text-primary" />;
    }
  };

  const getStatusLabel = (status: Invoice['status']) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'partially_refunded': return 'Partially Refunded';
      case 'refunded': return 'Refunded';
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
            <span class="status ${invoice.status}">${getStatusLabel(invoice.status)}</span>
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="flex gap-4">
            <div className="h-10 w-24 bg-muted rounded" />
            <div className="h-10 w-24 bg-muted rounded" />
          </div>
          <div className="card-elevated p-6">
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
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
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Payments</h1>
          <p className="text-sm text-muted-foreground sm:text-base">View invoices and payment method information</p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('methods')}
            className={cn(
              "px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px",
              activeTab === 'methods' 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <CreditCard className="inline-block h-4 w-4 mr-2" />
            Payment methods
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={cn(
              "px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px",
              activeTab === 'invoices' 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="inline-block h-4 w-4 mr-2" />
            Refunded Invoices
          </button>
        </div>

        {activeTab === 'methods' && (
          <div className="space-y-4">
            <div className="card-elevated p-6 space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="font-semibold">Payment methods</h3>
                  <p className="text-sm text-muted-foreground">
                    Saved payment methods will be managed securely through our payment service provider
                    once card tokenisation is enabled.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Sensitive card information is entered and processed through the applicable payment
                    service provider. EloFix does not store CVV/CVC or full card numbers.
                  </p>
                </div>
              </div>
            </div>

            {cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Legacy display metadata only — not a vaulted payment method. These rows cannot be used
                  to charge a card.
                </p>
                {cards.map((card) => (
                  <div key={card.id} className="card-elevated p-4">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                          <CreditCard className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium capitalize">
                            {card.brand} •••• {card.last4}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Expires {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Status: LEGACY_METADATA_ONLY
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteLegacyCard(card.id)}
                        aria-label="Remove legacy card metadata"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="space-y-6">
            {(() => {
              const refundInvoices = invoices.filter(isRefundInvoice);
              if (refundInvoices.length === 0) {
                return (
                  <div className="card-elevated p-12 text-center">
                    <RotateCcw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">No refunds yet</h3>
                    <p className="text-muted-foreground text-sm">
                      Completed refunds for your jobs will appear here
                    </p>
                  </div>
                );
              }
              return groupInvoicesByJob(refundInvoices).map((group) => (
                <div key={group.jobId}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                    {group.jobId && !String(group.jobId).startsWith('store-') ? (
                      <Button variant="link" className="h-auto p-0 text-xs" asChild>
                        <Link to={`/user/jobs/${group.jobId}`}>Open job</Link>
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {group.invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="card-elevated p-4 cursor-pointer hover:border-primary/30 transition-colors"
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                              <RotateCcw className="h-4 w-4 text-success" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">Refund · {group.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {format(parseISO(invoice.paidAt), 'PPP')}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                            <div className="text-left sm:text-right">
                              <p className="font-semibold text-success tabular-nums">
                                +{formatCurrency(invoice.totalAmount, { decimals: 2 })}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-success">
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Refunded</span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
            </DialogHeader>
            {selectedInvoice && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice ID</p>
                    <p className="font-medium">{selectedInvoice.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedInvoice.status)}
                    <span className="text-sm font-medium">{getStatusLabel(selectedInvoice.status)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Job Reference</p>
                    <p className="font-medium">{selectedInvoice.jobId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Date</p>
                    <p className="font-medium">{format(parseISO(selectedInvoice.paidAt), 'PPP')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Method</p>
                    <p className="font-medium">{selectedInvoice.paymentMethod}</p>
                  </div>
                  {selectedInvoice.cardLast4 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Card</p>
                      <p className="font-medium">•••• {selectedInvoice.cardLast4}</p>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-medium mb-2">Cost Breakdown</h4>
                  <div className="space-y-2 border border-border rounded-lg p-3">
                    {selectedInvoice.lineItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {item.description}
                          {item.quantity > 1 && ` (x${item.quantity})`}
                        </span>
                        <span>{formatCurrency(item.total, { decimals: 2 })}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 mt-2 flex justify-between font-medium">
                      <span>Total</span>
                      <span>{formatCurrency(selectedInvoice.totalAmount, { decimals: 2 })}</span>
                    </div>
                    {selectedInvoice.refundedAmount && (
                      <div className="flex justify-between text-success">
                        <span>Refunded</span>
                        <span>-{formatCurrency(selectedInvoice.refundedAmount, { decimals: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedInvoice.hardwareStores && selectedInvoice.hardwareStores.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Hardware Stores</p>
                    <p className="font-medium">{selectedInvoice.hardwareStores.join(', ')}</p>
                  </div>
                )}
                {selectedInvoice.driverName && (
                  <div>
                    <p className="text-sm text-muted-foreground">Driver</p>
                    <p className="font-medium">{selectedInvoice.driverName}</p>
                  </div>
                )}
                {selectedInvoice.vehicleInfo && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="font-medium">{selectedInvoice.vehicleInfo}</p>
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
