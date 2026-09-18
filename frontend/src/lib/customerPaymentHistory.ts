import type { Invoice } from '@/types';

export function isRefundInvoice(invoice: Invoice): boolean {
  const type = String(invoice.type || '').toLowerCase();
  if (type === 'refund') return true;
  // Original labor/material/delivery rows stay in Payments even if later refunded.
  if (type === 'labor' || type === 'materials' || type === 'delivery') return false;

  const source = metaString(invoice, 'source').toLowerCase();
  if (source === 'paystack_refund_processed') return true;
  const lines = invoice.lineItems || [];
  if (lines.length > 0 && lines.every((line) => /refund/i.test(String(line.description || '')))) {
    return true;
  }
  return false;
}

export function isPaymentInvoice(invoice: Invoice): boolean {
  return !isRefundInvoice(invoice);
}

function trimId(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function invoiceMeta(invoice: Invoice): Record<string, unknown> {
  const meta = invoice.meta;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

function metaString(invoice: Invoice, key: string): string {
  const top = (invoice as Invoice & Record<string, unknown>)[key];
  if (top != null && String(top).trim() !== '') return String(top).trim();
  const nested = invoiceMeta(invoice)[key];
  if (nested != null && String(nested).trim() !== '') return String(nested).trim();
  return '';
}

export function invoiceMaterialOrderId(invoice: Invoice): string {
  return (
    metaString(invoice, 'materialOrderId') ||
    metaString(invoice, 'orderId') ||
    metaString(invoice, 'jobStoreOrderId') ||
    ''
  );
}

export function invoiceJobStoreOrderId(invoice: Invoice): string {
  return metaString(invoice, 'jobStoreOrderId');
}

function looksLikeJobId(jobId: string): boolean {
  if (!jobId) return false;
  if (jobId.startsWith('store-')) return false;
  return true;
}

function isKnownJobId(jobId: string, knownJobIds: Set<string>): boolean {
  return looksLikeJobId(jobId) && knownJobIds.has(jobId);
}

export type PaymentHistoryGroupKind = 'job' | 'material_order' | 'ungrouped';

export type PaymentHistoryGroup = {
  key: string;
  kind: PaymentHistoryGroupKind;
  title: string;
  subtitle: string;
  invoices: Invoice[];
  totalPaid: number;
};

export function paymentGroupKey(
  invoice: Invoice,
  knownJobIds: Set<string> = new Set()
): { kind: PaymentHistoryGroupKind; id: string } {
  const jobId = trimId(invoice.jobId);
  const orderRef = invoiceMaterialOrderId(invoice);
  const type = String(invoice.type || '').toLowerCase();
  const knownJob = isKnownJobId(jobId, knownJobIds);

  if (type === 'materials' || type === 'delivery') {
    if (knownJob) return { kind: 'job', id: jobId };
    if (orderRef) return { kind: 'material_order', id: orderRef };
    if (jobId) return { kind: 'ungrouped', id: jobId };
    return { kind: 'ungrouped', id: trimId(invoice.id) || 'unknown' };
  }

  if (knownJob) return { kind: 'job', id: jobId };
  if (jobId && (type === 'labor' || type === 'refund')) {
    return { kind: 'job', id: jobId };
  }
  if (orderRef) return { kind: 'material_order', id: orderRef };
  if (jobId) return { kind: 'ungrouped', id: jobId };
  return { kind: 'ungrouped', id: trimId(invoice.id) || 'unknown' };
}

export function invoiceDisplayLabel(invoice: Invoice, groupKind: PaymentHistoryGroupKind): string {
  const type = String(invoice.type || '').toLowerCase();
  const paymentType = metaString(invoice, 'paymentType').toUpperCase();
  const firstLine = String(invoice.lineItems?.[0]?.description || '');

  if (type === 'labor') {
    if (paymentType === 'DEPOSIT' || /deposit/i.test(firstLine)) return 'Service deposit';
    if (paymentType === 'COMPLETION' || /completion/i.test(firstLine)) return 'Service completion';
    return 'Service payment';
  }
  if (type === 'materials') {
    return 'Materials purchase';
  }
  if (type === 'delivery') {
    return groupKind === 'material_order' ? 'Store delivery' : 'Delivery payment';
  }
  if (type === 'refund') return 'Refund';
  return firstLine || 'Payment';
}

export function invoiceStatusLabel(status: Invoice['status'] | string): string {
  switch (String(status || '').toLowerCase()) {
    case 'paid':
      return 'Paid';
    case 'partially_refunded':
      return 'Partially Refunded';
    case 'refunded':
      return 'Refunded';
    default:
      return String(status || 'Paid');
  }
}

function shortRef(id: string): string {
  const trimmed = trimId(id);
  if (trimmed.length <= 8) return trimmed;
  return trimmed.slice(-8);
}

export function groupPaymentInvoices(
  invoices: Invoice[],
  jobs: { id: string; categoryName: string }[] = []
): PaymentHistoryGroup[] {
  const knownJobIds = new Set(jobs.map((j) => j.id));
  const jobName = new Map(jobs.map((j) => [j.id, j.categoryName]));
  const buckets = new Map<string, PaymentHistoryGroup>();

  for (const invoice of invoices) {
    const { kind, id } = paymentGroupKey(invoice, knownJobIds);
    const mapKey = `${kind}:${id}`;
    let group = buckets.get(mapKey);
    if (!group) {
      if (kind === 'job') {
        group = {
          key: mapKey,
          kind,
          title: jobName.get(id) || metaString(invoice, 'jobTitle') || 'Service job',
          subtitle: `Job #${shortRef(id)}`,
          invoices: [],
          totalPaid: 0,
        };
      } else if (kind === 'material_order') {
        const store =
          metaString(invoice, 'storeName') ||
          invoice.hardwareStores?.[0] ||
          'Material order';
        group = {
          key: mapKey,
          kind,
          title: store,
          subtitle: `Order #${shortRef(id)}`,
          invoices: [],
          totalPaid: 0,
        };
      } else {
        group = {
          key: mapKey,
          kind,
          title: invoice.hardwareStores?.[0] || metaString(invoice, 'storeName') || 'Payment',
          subtitle: id ? `#${shortRef(id)}` : '',
          invoices: [],
          totalPaid: 0,
        };
      }
      buckets.set(mapKey, group);
    }
    group.invoices.push(invoice);
    group.totalPaid += Number(invoice.totalAmount) || 0;
  }

  const groups = Array.from(buckets.values());
  for (const group of groups) {
    group.invoices.sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    );
  }
  groups.sort((a, b) => {
    const aLatest = Math.max(...a.invoices.map((i) => new Date(i.paidAt).getTime()));
    const bLatest = Math.max(...b.invoices.map((i) => new Date(i.paidAt).getTime()));
    return bLatest - aLatest;
  });
  return groups;
}
