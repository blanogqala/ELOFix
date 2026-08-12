import type { Job, JobPaymentSummary, LaborPaymentType } from '@/types';
import { paymentModeLabel } from '@/lib/paymentSchedule';

export type InvoicePaymentStatus =
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'FULLY_PAID'
  | 'REFUNDED'
  | 'FAILED';

export type InvoiceBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  status: 'PAID' | 'UNPAID' | 'PENDING';
};

export type InvoiceHistoryEntry = {
  id: string;
  paymentType: LaborPaymentType | string;
  title: string;
  amount: number;
  status: 'PAID';
  paymentRef?: string | null;
  paidAt?: string | null;
  maskedPaymentMethod?: string | null;
  paidBy?: string | null;
};

export type ServicePaymentInvoiceModel = {
  invoiceNumber: string;
  jobId: string;
  jobShortId: string;
  jobTitle: string;
  categoryName: string;
  customerName: string;
  providerName: string;
  paymentModeLabel: string;
  serviceTotal: number;
  totalPaid: number;
  balance: number;
  status: InvoicePaymentStatus;
  statusLabel: string;
  breakdown: InvoiceBreakdownRow[];
  history: InvoiceHistoryEntry[];
  fullyPaidAt: string | null;
  hasPaymentSummary: boolean;
};

export type ProviderPaymentDetailsModel = {
  jobId: string;
  jobShortId: string;
  jobTitle: string;
  categoryName: string;
  paymentModeLabel: string;
  serviceTotal: number;
  status: InvoicePaymentStatus;
  statusLabel: string;
  customerTotalPaid: number;
  customerBalance: number;
  commissionRecorded: number;
  providerShareRecorded: number;
  providerShareRemaining: number;
  breakdown: InvoiceBreakdownRow[];
  history: InvoiceHistoryEntry[];
  isFullyPaid: boolean;
  hasProviderShareRecorded: boolean;
  hasPaymentSummary: boolean;
};

type PaymentMetaLike = {
  status?: string;
  amount?: number;
  paymentType?: string;
  paidAt?: string;
  paymentRef?: string;
  paidBy?: string;
  maskedPaymentMethod?: string;
  commissionAmount?: number;
  recipientAmount?: number;
};

function nearlyZero(n: number): boolean {
  return Math.abs(Number(n) || 0) < 0.005;
}

export function serviceInvoiceNumber(jobId: string): string {
  const id = String(jobId || '').replace(/-/g, '');
  const short = (id.slice(0, 8) || '00000000').toUpperCase();
  return `EFX-${short}`;
}

export function jobShortId(jobId: string): string {
  const id = String(jobId || '');
  return id.length > 8 ? id.slice(0, 8) : id;
}

function historyTitle(paymentType: string): string {
  switch (String(paymentType || '').toUpperCase()) {
    case 'DEPOSIT':
      return 'Deposit payment';
    case 'COMPLETION':
      return 'Completion payment';
    case 'FULL_UPFRONT':
      return 'Full upfront payment';
    case 'FULL_COMPLETION':
      return 'Full completion payment';
    default:
      return 'Service payment';
  }
}

function metaToHistory(
  id: string,
  meta: PaymentMetaLike | null | undefined,
  fallbackType: string
): InvoiceHistoryEntry | null {
  if (!meta || String(meta.status || '').toLowerCase() !== 'paid') return null;
  const amount = Number(meta.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const paymentType = String(meta.paymentType || fallbackType);
  return {
    id,
    paymentType,
    title: historyTitle(paymentType),
    amount,
    status: 'PAID',
    paymentRef: meta.paymentRef || null,
    paidAt: meta.paidAt || null,
    maskedPaymentMethod: meta.maskedPaymentMethod || null,
    paidBy: meta.paidBy || null,
  };
}

function buildHistory(job: Job): InvoiceHistoryEntry[] {
  const deposit = metaToHistory('deposit', job.depositPayment as PaymentMetaLike | undefined, 'DEPOSIT');
  const completion = metaToHistory(
    'completion',
    job.completionPayment as PaymentMetaLike | undefined,
    'COMPLETION'
  );
  const entries: InvoiceHistoryEntry[] = [];
  if (deposit) entries.push(deposit);
  if (completion) entries.push(completion);

  // Single full payment modes often only write servicePayment (or deposit as the full pay).
  if (entries.length === 0 && job.servicePayment) {
    const sp = metaToHistory('service', job.servicePayment as PaymentMetaLike, 'FULL_UPFRONT');
    if (sp) entries.push(sp);
  }

  // Prefer deposit/completion; if servicePayment is a distinct full-pay record already covered, skip.
  // Backfill masked method / paidBy from servicePayment when tranche meta omits them.
  const sp = job.servicePayment as PaymentMetaLike | undefined;
  if (sp) {
    for (const entry of entries) {
      if (!entry.maskedPaymentMethod && sp.maskedPaymentMethod) {
        entry.maskedPaymentMethod = sp.maskedPaymentMethod;
      }
      if (!entry.paidBy && sp.paidBy) {
        entry.paidBy = sp.paidBy;
      }
    }
  }
  return entries;
}

function resolveServiceTotal(job: Job, summary: JobPaymentSummary | null): number {
  if (summary && Number.isFinite(Number(summary.totalAmount))) {
    return Number(summary.totalAmount);
  }
  const quoted = Number(job.quotedAmount ?? job.paymentSchedule?.quotedAmount ?? job.servicePrice?.amount);
  if (Number.isFinite(quoted) && quoted > 0) return quoted;
  return 0;
}

function resolvePaidRemaining(
  job: Job,
  summary: JobPaymentSummary | null,
  serviceTotal: number
): { paid: number; remaining: number } {
  if (summary) {
    return {
      paid: Math.max(0, Number(summary.totalPaidByCustomer) || 0),
      remaining: Math.max(0, Number(summary.totalRemainingByCustomer) || 0),
    };
  }
  let paid = 0;
  if (job.depositPayment?.status === 'paid') paid += Number(job.depositPayment.amount) || 0;
  if (job.completionPayment?.status === 'paid') paid += Number(job.completionPayment.amount) || 0;
  if (paid <= 0 && job.servicePayment?.status === 'paid') {
    paid = Number(job.servicePayment.amount) || 0;
  }
  if (paid <= 0 && job.laborPaid) {
    paid = serviceTotal;
  }
  const remaining = Math.max(0, serviceTotal - paid);
  return { paid, remaining };
}

function resolveInvoiceStatus(
  job: Job,
  summary: JobPaymentSummary | null,
  paid: number,
  remaining: number
): InvoicePaymentStatus {
  const refundStatus = String(job.refundStatus || '').toLowerCase();
  if (refundStatus === 'processed' || refundStatus === 'partial' || (Number(job.refundAmount) || 0) > 0) {
    if (nearlyZero(remaining) && paid > 0) {
      // Fully paid then refunded still show refunded as primary when refund recorded
      if (refundStatus === 'processed' || refundStatus === 'partial') return 'REFUNDED';
    }
  }

  if (summary) {
    const label = String(summary.label || '');
    if (label === 'FULLY_PAID' || (paid > 0 && nearlyZero(remaining))) return 'FULLY_PAID';
    if (paid > 0 && remaining > 0) return 'PARTIALLY_PAID';
    return 'PENDING';
  }

  const progress = String(job.paymentProgress || job.paymentSchedule?.paymentProgress || '');
  if (progress === 'FULLY_PAID' || (paid > 0 && nearlyZero(remaining))) return 'FULLY_PAID';
  if (progress === 'FIRST_PAID' || (paid > 0 && remaining > 0)) return 'PARTIALLY_PAID';
  return 'PENDING';
}

export function invoiceStatusLabel(status: InvoicePaymentStatus): string {
  switch (status) {
    case 'FULLY_PAID':
      return 'FULLY PAID';
    case 'PARTIALLY_PAID':
      return 'PARTIALLY PAID';
    case 'REFUNDED':
      return 'REFUNDED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

function buildBreakdown(job: Job, summary: JobPaymentSummary | null, serviceTotal: number): InvoiceBreakdownRow[] {
  if (summary) {
    const rows: InvoiceBreakdownRow[] = [];
    if (summary.deposit) {
      const isFiftyFifty = String(summary.mode) === 'TWO_PAYMENT_50_50';
      rows.push({
        key: 'deposit',
        label: isFiftyFifty ? 'Deposit (50%)' : summary.deposit.status === 'PAID' ? 'Service payment' : 'Payment due',
        amount: Number(summary.deposit.amount) || 0,
        status: summary.deposit.status === 'PAID' ? 'PAID' : 'PENDING',
      });
    }
    if (summary.completion) {
      const isFiftyFifty = String(summary.mode) === 'TWO_PAYMENT_50_50';
      rows.push({
        key: 'completion',
        label: isFiftyFifty ? 'Completion (50%)' : 'Service payment',
        amount: Number(summary.completion.amount) || 0,
        status: summary.completion.status === 'PAID' ? 'PAID' : 'PENDING',
      });
    }
    if (rows.length > 0) return rows;
  }

  const mode = String(job.paymentModeSnapshot ?? job.paymentSchedule?.paymentMode ?? '');
  if (mode === 'TWO_PAYMENT_50_50') {
    const first = Number(job.firstPaymentAmount ?? job.paymentSchedule?.firstPaymentAmount ?? serviceTotal / 2);
    const second = Number(job.secondPaymentAmount ?? job.paymentSchedule?.secondPaymentAmount ?? serviceTotal / 2);
    const depositPaid = Boolean(job.depositPayment) || String(job.paymentProgress) === 'FIRST_PAID' || String(job.paymentProgress) === 'FULLY_PAID';
    const completionPaid = Boolean(job.completionPayment) || String(job.paymentProgress) === 'FULLY_PAID';
    return [
      {
        key: 'deposit',
        label: 'Deposit (50%)',
        amount: first,
        status: depositPaid ? 'PAID' : 'PENDING',
      },
      {
        key: 'completion',
        label: 'Completion (50%)',
        amount: second,
        status: completionPaid ? 'PAID' : 'PENDING',
      },
    ];
  }

  const paid = Boolean(job.servicePayment) || Boolean(job.laborPaid) || String(job.paymentProgress) === 'FULLY_PAID';
  return [
    {
      key: 'full',
      label: 'Service payment',
      amount: serviceTotal,
      status: paid ? 'PAID' : 'PENDING',
    },
  ];
}

export function buildServicePaymentInvoiceModel(job: Job): ServicePaymentInvoiceModel {
  const summary = job.paymentSummary ?? null;
  const serviceTotal = resolveServiceTotal(job, summary);
  const { paid, remaining } = resolvePaidRemaining(job, summary, serviceTotal);
  const status = resolveInvoiceStatus(job, summary, paid, remaining);
  const history = buildHistory(job);
  const fullyPaidAt =
    history.length > 0
      ? history.map((h) => h.paidAt).filter(Boolean).sort().slice(-1)[0] || null
      : null;

  const mode = summary?.mode ?? job.paymentModeSnapshot ?? job.paymentSchedule?.paymentMode ?? null;

  return {
    invoiceNumber: serviceInvoiceNumber(job.id),
    jobId: job.id,
    jobShortId: jobShortId(job.id),
    jobTitle: job.categoryName || job.title || 'Service',
    categoryName: job.categoryName || job.title || 'Service',
    customerName: job.userName || 'Customer',
    providerName: job.providerName || 'Provider',
    paymentModeLabel: paymentModeLabel(mode),
    serviceTotal,
    totalPaid: paid,
    balance: remaining,
    status,
    statusLabel: invoiceStatusLabel(status),
    breakdown: buildBreakdown(job, summary, serviceTotal),
    history,
    fullyPaidAt,
    hasPaymentSummary: Boolean(summary),
  };
}

export function buildProviderPaymentDetailsModel(job: Job): ProviderPaymentDetailsModel {
  const invoice = buildServicePaymentInvoiceModel(job);
  const summary = job.paymentSummary ?? null;

  const commissionRecorded = summary
    ? Math.max(0, Number(summary.commissionRecorded) || 0)
    : (() => {
        let c = 0;
        if (job.depositPayment?.commissionAmount != null) c += Number(job.depositPayment.commissionAmount) || 0;
        if (job.completionPayment?.commissionAmount != null) c += Number(job.completionPayment.commissionAmount) || 0;
        return c;
      })();

  const providerShareRecorded = summary
    ? Math.max(0, Number(summary.providerShareRecorded) || 0)
    : (() => {
        let s = 0;
        if (job.depositPayment?.recipientAmount != null) s += Number(job.depositPayment.recipientAmount) || 0;
        if (job.completionPayment?.recipientAmount != null) s += Number(job.completionPayment.recipientAmount) || 0;
        return s;
      })();

  const providerShareRemaining = summary
    ? Math.max(0, Number(summary.providerShareRemaining) || 0)
    : Math.max(0, invoice.serviceTotal * 0.93 - providerShareRecorded);

  return {
    jobId: job.id,
    jobShortId: invoice.jobShortId,
    jobTitle: invoice.jobTitle,
    categoryName: invoice.categoryName,
    paymentModeLabel: invoice.paymentModeLabel,
    serviceTotal: invoice.serviceTotal,
    status: invoice.status,
    statusLabel: invoice.statusLabel,
    customerTotalPaid: invoice.totalPaid,
    customerBalance: invoice.balance,
    commissionRecorded,
    providerShareRecorded,
    providerShareRemaining,
    breakdown: invoice.breakdown,
    history: invoice.history,
    isFullyPaid: invoice.status === 'FULLY_PAID',
    hasProviderShareRecorded: providerShareRecorded > 0,
    hasPaymentSummary: Boolean(summary),
  };
}

/** Print-HTML for customer service invoice (same numbers as UI). */
export function buildServiceInvoicePrintHtml(model: ServicePaymentInvoiceModel): string {
  const fmt = (n: number) =>
    `R${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const breakdownRows = model.breakdown
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.label)}</td><td style="text-align:right">${fmt(r.amount)}</td><td style="text-align:right">${r.status === 'PAID' ? 'Paid' : 'Pending'}</td></tr>`
    )
    .join('');
  const historyRows = model.history
    .map(
      (h) => `
      <div style="margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:8px">
        <div style="font-weight:600">${escapeHtml(h.title)}</div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <span>${fmt(h.amount)}</span><span>Paid</span>
        </div>
        ${h.paymentRef ? `<div style="font-size:12px;margin-top:4px">Payment reference: ${escapeHtml(h.paymentRef)}</div>` : ''}
        ${h.paidAt ? `<div style="font-size:12px">Date: ${escapeHtml(new Date(h.paidAt).toLocaleString())}</div>` : ''}
        ${h.maskedPaymentMethod ? `<div style="font-size:12px">Method: ${escapeHtml(h.maskedPaymentMethod)}</div>` : ''}
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <title>Service Payment Invoice ${escapeHtml(model.invoiceNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 720px; margin: 0 auto; color: #0A2540; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; margin: 28px 0 10px; }
    .muted { color: #666; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; }
    .totals td { border-bottom: none; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; background: #d4edda; color: #155724; font-weight: 600; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-weight:700;font-size:18px">EloFix</div>
      <h1>SERVICE PAYMENT INVOICE</h1>
      <p class="muted">Invoice #: ${escapeHtml(model.invoiceNumber)}</p>
    </div>
    <div style="text-align:right">
      <span class="status">${escapeHtml(model.statusLabel)}</span>
      ${model.fullyPaidAt ? `<p class="muted" style="margin-top:8px">Completed: ${escapeHtml(new Date(model.fullyPaidAt).toLocaleString())}</p>` : ''}
    </div>
  </div>

  <p><strong>Job:</strong> ${escapeHtml(model.categoryName)}<br/>
  <strong>Job ID:</strong> #${escapeHtml(model.jobShortId)}</p>
  <p><strong>Customer:</strong> ${escapeHtml(model.customerName)}<br/>
  <strong>Service provider:</strong> ${escapeHtml(model.providerName)}</p>

  <h2>Service summary</h2>
  <table>
    <tr><td>Service price</td><td style="text-align:right;font-weight:600">${fmt(model.serviceTotal)}</td></tr>
  </table>

  <h2>Payment breakdown</h2>
  <table>
    ${breakdownRows}
    <tr class="totals"><td><strong>Total service amount</strong></td><td style="text-align:right" colspan="2"><strong>${fmt(model.serviceTotal)}</strong></td></tr>
    <tr class="totals"><td>Total paid</td><td style="text-align:right" colspan="2">${fmt(model.totalPaid)}</td></tr>
    <tr class="totals"><td>Outstanding balance</td><td style="text-align:right" colspan="2">${fmt(model.balance)}</td></tr>
  </table>

  <h2>Payment history</h2>
  ${historyRows || '<p class="muted">No payments recorded yet.</p>'}

  <p style="margin-top:24px;font-size:18px;font-weight:700">TOTAL PAID ${fmt(model.totalPaid)}</p>
  <p>✓ ${escapeHtml(model.statusLabel)}</p>
  <p class="muted" style="margin-top:32px">Thank you for using EloFix.</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printServicePaymentInvoice(model: ServicePaymentInvoiceModel): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(buildServiceInvoicePrintHtml(model));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
