import type { Job } from '@/types';
import { formatCurrency } from '@/lib/formatCurrency';
import { getQuoteMaterialsRefundTotal, getUserLaborGross } from '@/lib/jobUtils';
import { isMaterialOrderRefunded } from '@/lib/materialBatchTracking';

function num(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MATERIAL_COMMISSION_RATE = 0.07;
const MATERIAL_SUPPLIER_SHARE_RATE = 0.93;

/** Mirrors backend splitMaterialsCommission — commission on materials subtotal only. */
function splitMaterialsCommission(materialsSubtotal: number): {
  gross: number;
  commission: number;
  net: number;
} {
  const gross = roundMoney(Math.max(0, materialsSubtotal));
  const commission = roundMoney(gross * MATERIAL_COMMISSION_RATE);
  const net = roundMoney(gross * MATERIAL_SUPPLIER_SHARE_RATE);
  return { gross, commission, net };
}

function isActivePaidMaterialOrder(
  order: NonNullable<Job['jobMaterialOrders']>[number],
  supplierId: string,
): boolean {
  if (String(order.supplierId || '') !== supplierId) return false;
  if (String(order.paymentStatus || '').toLowerCase() !== 'paid') return false;
  if (String(order.fulfillmentStatus || '').toUpperCase() === 'CANCELLED') return false;
  return true;
}

function snapshotGrossAmount(o: NonNullable<Job['jobMaterialOrders']>[number]): number {
  const sub = num(o.materialsSubtotal);
  if (sub > 0) return sub;
  const total = num(o.total);
  if (total > 0) return total;
  const items = o.items ?? [];
  return items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0);
}

/** Gross materials paid on job including cancelled/refunded orders (for admin quote display). */
function getAdminJobQuoteGrossMaterials(job: Job): number {
  const orders = job.jobMaterialOrders ?? [];
  const paidOrRefunded = orders.filter((o) => {
    const ps = String(o.paymentStatus ?? '').toLowerCase();
    if (ps === 'paid' || ps === 'refunded') return true;
    return isMaterialOrderRefunded(o);
  });
  if (paidOrRefunded.length > 0) {
    return roundMoney(paidOrRefunded.reduce((s, o) => s + snapshotGrossAmount(o), 0));
  }
  const legacyPaid = (job.materialPayments ?? []).filter(
    (p) => p && p.status === 'paid' && p.amount != null,
  );
  if (legacyPaid.length > 0) {
    return roundMoney(legacyPaid.reduce((s, p) => s + num(p.amount), 0));
  }
  return roundMoney(
    (job.materials ?? []).reduce((s, m) => s + num(m.qty) * num(m.unitPrice), 0),
  );
}

/** Labor refund returned to customer (excludes material refunds in meta). */
export function getAdminJobLaborRefund(job: Job): number {
  const customerNet = num(job.refundDetails?.customerNet);
  if (customerNet > 0) return roundMoney(customerNet);
  const cumulative = num(job.refundAmount ?? job.refundDetails?.cumulativeCustomerNet);
  if (cumulative <= 0) return 0;
  const materialRefund = getQuoteMaterialsRefundTotal(job);
  return roundMoney(Math.max(0, cumulative - materialRefund));
}

export type AdminMaterialStoreBreakdownResult = {
  gross: number;
  commission: number;
  net: number;
  refund: number;
  cancelled: boolean;
};

/** Per-store material gross, 7% commission, and supplier net for admin job detail. */
export function getAdminMaterialStoreBreakdown(
  job: Job,
  supplierId: string,
  lineItemsTotal: number,
): AdminMaterialStoreBreakdownResult {
  const supplierOrders = (job.jobMaterialOrders ?? []).filter(
    (o) => String(o.supplierId || '') === supplierId,
  );
  const refundedOrders = supplierOrders.filter((o) => isMaterialOrderRefunded(o));
  if (refundedOrders.length > 0) {
    const gross = roundMoney(refundedOrders.reduce((s, o) => s + snapshotGrossAmount(o), 0));
    const refund = roundMoney(refundedOrders.reduce((s, o) => s + num(o.refundAmount), 0));
    const commission = roundMoney(refundedOrders.reduce((s, o) => s + num(o.platformCommission), 0));
    return {
      gross,
      commission,
      net: roundMoney(Math.max(0, gross - refund)),
      refund,
      cancelled: true,
    };
  }

  const paidOrders = supplierOrders.filter((o) => isActivePaidMaterialOrder(o, supplierId));
  if (paidOrders.length > 0) {
    const gross = roundMoney(paidOrders.reduce((s, o) => s + num(o.materialsSubtotal), 0));
    const commission = roundMoney(paidOrders.reduce((s, o) => s + num(o.platformCommission), 0));
    const net = roundMoney(paidOrders.reduce((s, o) => s + num(o.supplierEarning), 0));
    if (gross > 0) {
      return { gross, commission, net, refund: 0, cancelled: false };
    }
  }

  const legacyPaid = (job.materialPayments ?? []).filter(
    (p) => p && p.status === 'paid' && String(p.supplierId) === supplierId && p.amount != null,
  );
  if (legacyPaid.length > 0) {
    const gross = roundMoney(legacyPaid.reduce((s, p) => s + num(p.amount), 0));
    if (gross > 0) {
      const split = splitMaterialsCommission(gross);
      return { ...split, refund: 0, cancelled: false };
    }
  }

  const split = splitMaterialsCommission(lineItemsTotal);
  return { ...split, refund: 0, cancelled: false };
}

/** Formatted per-store material settlement: "R gross - R commission = R supplier net". */
export function formatAdminMaterialStoreBreakdown(
  job: Job,
  supplierId: string,
  lineItemsTotal: number,
): string {
  const { gross, commission, net } = getAdminMaterialStoreBreakdown(job, supplierId, lineItemsTotal);
  if (gross <= 0) {
    return '—';
  }
  return `${formatCurrency(gross, { decimals: 2 })} - ${formatCurrency(commission, { decimals: 2 })} = ${formatCurrency(net, { decimals: 2 })}`;
}

/** Quote labor for admin jobs list (mirrors customer JobDetail labor resolution). */
function getAdminJobQuoteLabor(job: Job): number {
  if (job.laborPaid) {
    return getUserLaborGross(job);
  }
  if (job.proposedLaborPrice?.amount != null) {
    return num(job.proposedLaborPrice.amount);
  }
  if (job.servicePrice?.amount != null) {
    return num(job.servicePrice.amount);
  }
  if (job.courierFlow) {
    const fee = job.deliverySummary?.quotedFee;
    if (fee != null && Number.isFinite(Number(fee))) {
      return Number(fee);
    }
  }
  const max = num(job.laborEstimateRange?.max);
  return max > 0 ? max : getUserLaborGross(job);
}

/** Labor + material quote breakdown for admin jobs list. */
export function getAdminJobQuoteBreakdown(job: Job): {
  labor: number;
  material: number;
  total: number;
  laborRefund: number;
  materialRefund: number;
  netTotal: number;
  hasRefunds: boolean;
} {
  const labor = roundMoney(getAdminJobQuoteLabor(job));
  const material = roundMoney(getAdminJobQuoteGrossMaterials(job));
  const laborRefund = getAdminJobLaborRefund(job);
  const materialRefund = getQuoteMaterialsRefundTotal(job);
  const total = roundMoney(labor + material);
  const netTotal = roundMoney(
    Math.max(0, labor - laborRefund) + Math.max(0, material - materialRefund),
  );
  return {
    labor,
    material,
    total,
    laborRefund,
    materialRefund,
    netTotal,
    hasRefunds: laborRefund > 0 || materialRefund > 0,
  };
}

/** Formatted quote string: "R X + R Y = R Z" for admin jobs table. */
export function formatAdminJobQuoteBreakdown(job: Job): string {
  const { labor, material, total, laborRefund, materialRefund, netTotal, hasRefunds } =
    getAdminJobQuoteBreakdown(job);
  if (labor <= 0 && material <= 0) {
    return '—';
  }
  const base = `${formatCurrency(labor, { decimals: 2 })} + ${formatCurrency(material, { decimals: 2 })} = ${formatCurrency(total, { decimals: 2 })}`;
  if (!hasRefunds) return base;
  const parts = [base];
  if (laborRefund > 0) {
    parts.push(`−${formatCurrency(laborRefund, { decimals: 2 })} labor refunded`);
  }
  if (materialRefund > 0) {
    parts.push(`−${formatCurrency(materialRefund, { decimals: 2 })} material refunded`);
  }
  parts.push(`Net ${formatCurrency(netTotal, { decimals: 2 })}`);
  return parts.join('\n');
}

/** Formatted platform commission: "R labor + R material = R total". */
export function formatAdminCommissionBreakdown(
  labor: number,
  material: number,
  total?: number
): string {
  const laborAmount = roundMoney(labor);
  const materialAmount = roundMoney(material);
  const totalAmount = roundMoney(total ?? laborAmount + materialAmount);
  return `${formatCurrency(laborAmount, { decimals: 2 })} + ${formatCurrency(materialAmount, { decimals: 2 })} = ${formatCurrency(totalAmount, { decimals: 2 })}`;
}

/** Paid labor including courier delivery fees (mirrors backend jobPaidAmount.util). */
export function getAdminJobLaborPaid(job: Job): number {
  const sp = job.servicePayment;
  if (sp && sp.status === 'paid' && sp.amount != null) {
    return num(sp.amount);
  }
  if (job.laborPaid) {
    return (
      num(job.totalPrice) ||
      num(job.servicePrice?.amount) ||
      num(job.totalEstimateRange?.min)
    );
  }
  return 0;
}

/** Paid material batches on the job. */
export function getAdminJobMaterialsPaid(job: Job): number {
  const mps = Array.isArray(job.materialPayments) ? job.materialPayments : [];
  return mps.reduce((sum, p) => {
    if (p && p.status === 'paid' && p.amount != null) {
      return sum + num(p.amount);
    }
    return sum;
  }, 0);
}

/** Total customer-paid amount (labor + materials). Prefer API field when present. */
export function getAdminJobCustomerPaidTotal(job: Job): number {
  const fromApi = num(job.customerPaidTotal);
  if (fromApi > 0) return fromApi;
  return getAdminJobLaborPaid(job) + getAdminJobMaterialsPaid(job);
}

/** List/table display: paid total when known, otherwise quoted labor estimate. */
export function getAdminJobDisplayTotal(job: Job): number {
  const paid = getAdminJobCustomerPaidTotal(job);
  if (paid > 0) return paid;
  return getAdminEscrowV2Breakdown(job).totalPrice || num(job.totalEstimateRange?.min);
}

/**
 * Paid labor + courier/delivery/mover jobs for admin Payments provider-share cards.
 * Any status (active, completed, cancelled).
 */
export function isAdminPaidLaborProviderJob(job: Job): boolean {
  return job.laborPaid === true;
}

/**
 * @deprecated Use isAdminPaidLaborProviderJob — completed-only subset.
 */
export function isAdminLaborProviderEscrowJob(job: Job): boolean {
  if (!isAdminPaidLaborProviderJob(job)) return false;
  if (job.status !== 'COMPLETED') return false;
  return num(job.providerAmount) > 0 || num(job.releasedAmount) > 0;
}

/** Provider share (93%) for a paid labor job — uses settled providerAmount when present. */
export function getAdminPaidLaborProviderShare(job: Job): number {
  const provider = num(job.providerAmount);
  if (provider > 0) return roundMoney(provider);
  const laborPaid = getAdminJobLaborPaid(job);
  if (laborPaid > 0) return roundMoney(laborPaid * 0.93);
  return 0;
}

/** Amount already released to the provider (excludes escrow still held). */
export function getAdminPaidLaborReleasedAmount(job: Job): number {
  return roundMoney(num(job.releasedAmount));
}

/** Net labor refunded to customer (escrow + clawback + provider debt). */
export function getAdminJobProviderRefundDeduction(job: Job): number {
  const cumulative = num(job.refundDetails?.cumulativeCustomerNet);
  if (cumulative > 0) return roundMoney(cumulative);
  const customerNet = num(job.refundDetails?.customerNet);
  if (customerNet > 0) return roundMoney(customerNet);
  const refundAmt = num(job.refundAmount);
  if (refundAmt > 0) return roundMoney(refundAmt);
  const escrowApplied = num(job.refundDetails?.escrowApplied);
  const clawbackApplied = num(job.refundDetails?.clawbackApplied);
  const providerDebtAdded = num(job.refundDetails?.providerDebtAdded);
  return roundMoney(escrowApplied + clawbackApplied + providerDebtAdded);
}

/** Provider share (93%) after refund deductions. */
export function getAdminNetPaidLaborProviderShare(job: Job): number {
  const share = getAdminPaidLaborProviderShare(job);
  const deduction = getAdminJobProviderRefundDeduction(job);
  return roundMoney(Math.max(0, share - deduction));
}

/** Released amount after clawback and provider debt from refunds. */
export function getAdminNetPaidLaborReleasedAmount(job: Job): number {
  const released = getAdminPaidLaborReleasedAmount(job);
  const clawbackApplied = num(job.refundDetails?.clawbackApplied);
  const providerDebtAdded = num(job.refundDetails?.providerDebtAdded);
  return roundMoney(Math.max(0, released - clawbackApplied - providerDebtAdded));
}

/** Courier/delivery/mover jobs use full-hold escrow until customer confirms delivery. */
export function isAdminCourierEscrowJob(job: Job): boolean {
  return job.courierFlow === true;
}

/**
 * Admin manual escrow release is limited to grandfathered escrow-v2 labor jobs.
 * Courier jobs additionally require customer delivery confirmation.
 * Immediate-settlement jobs have no releasable escrow hold.
 */
export function canAdminManualReleaseEscrow(job: Job): boolean {
  if (isAdminCourierEscrowJob(job)) {
    return job.completionConfirmedByUser === true;
  }
  return job.legacyEscrowV2 === true;
}

/** Customer labor/service refund net (excludes material refunds). */
export function getAdminJobCustomerRefundNet(job: Job): number {
  return getAdminJobLaborRefund(job);
}

/** Escrow still owed to provider after customer refunds (0 when held funds returned on cancel). */
export function getAdminNetEscrowRemaining(job: Job): number {
  const fin = getAdminEscrowV2Breakdown(job);
  const refund = getAdminJobCustomerRefundNet(job);
  if (job.status === 'CANCELLED' && refund > 0) {
    return 0;
  }
  return roundMoney(Math.max(0, fin.remaining - refund));
}

/**
 * Admin-only display: labor jobs use 50/50 tranches; courier jobs use full-hold until delivery confirmed.
 * Commission and provider share come from the job API — not recalculated.
 */
export function getAdminEscrowV2Breakdown(job: Job) {
  const totalPrice =
    num(job.totalPrice) || num(job.totalEstimateRange?.min) || num(job.servicePrice?.amount);
  const commission = num(job.commissionAmount);
  const provider = num(job.providerAmount);
  const released = num(job.releasedAmount);
  const remaining =
    job.escrow?.heldAmount != null && Number.isFinite(Number(job.escrow.heldAmount))
      ? Math.max(0, num(job.escrow.heldAmount))
      : job.remainingAmount != null && Number.isFinite(Number(job.remainingAmount))
        ? Math.max(0, num(job.remainingAmount))
        : Math.max(0, provider - released);
  const isCourierEscrow = isAdminCourierEscrowJob(job);
  const half = provider > 0 ? provider / 2 : 0;
  const firstRelease =
    !isCourierEscrow && provider > 0 && half > 0 ? Math.min(released, half) : 0;
  const secondRelease =
    !isCourierEscrow && provider > 0 && half > 0
      ? Math.max(0, Math.min(Math.max(0, released - half), half))
      : 0;
  return {
    totalPrice,
    commission,
    provider,
    released,
    remaining,
    firstRelease,
    secondRelease,
    isCourierEscrow,
    deliveryConfirmed: job.completionConfirmedByUser === true,
  };
}

export type AdminJobTransactionRow = {
  type: string;
  amount: number;
  date: string;
  by: string;
};

/** Transaction history rows for admin payment detail. */
export function buildAdminJobTransactionHistory(job: Job): AdminJobTransactionRow[] {
  const rows: AdminJobTransactionRow[] = [];
  const labor = getAdminJobLaborPaid(job);
  if (labor > 0) {
    rows.push({
      type: job.courierFlow ? 'Delivery fee payment' : 'Labor payment',
      amount: labor,
      date: job.servicePayment?.paidAt || job.updatedAt || job.createdAt,
      by: job.servicePayment?.paidBy || job.userId || 'Customer',
    });
  }
  const mps = Array.isArray(job.materialPayments) ? job.materialPayments : [];
  mps.forEach((p) => {
    if (p && p.status === 'paid' && p.amount != null) {
      rows.push({
        type: 'Materials payment',
        amount: num(p.amount),
        date: p.paidAt || job.updatedAt || job.createdAt,
        by: p.paidBy || job.userId || 'Customer',
      });
    }
  });
  const released = num(job.releasedAmount) || num(job.escrow?.releasedAmount);
  if (released > 0) {
    rows.push({
      type: 'Escrow release',
      amount: released,
      date: job.updatedAt || job.createdAt,
      by: 'Platform',
    });
  }
  const laborRefund = getAdminJobLaborRefund(job);
  if (laborRefund > 0) {
    const cancelled = job.status === 'CANCELLED';
    rows.push({
      type: cancelled
        ? job.courierFlow
          ? 'Delivery cancellation refund (held funds to customer)'
          : 'Job cancellation refund (to customer)'
        : 'Customer refund',
      amount: laborRefund,
      date: job.cancelledAt || job.refundDetails?.processedAt || job.updatedAt || job.createdAt,
      by: job.cancelledBy === 'provider' ? 'Provider cancel' : job.cancelledBy === 'customer' ? 'Customer cancel' : 'Platform',
    });
  }
  return rows;
}
