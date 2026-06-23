export type OrderFinanceBreakdown = {
  materialsSubtotal: number;
  deliveryFee: number;
  orderGross: number;
  platformCommission: number;
  supplierNet: number;
  commissionBasis: 'materials_only' | 'materials_plus_delivery';
  deliveryPaid?: boolean;
  materialsPaid?: boolean;
  deliveryType?: string;
};

const COMMISSION_RATE = 0.07;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeDeliveryType(raw?: string | null): string {
  const u = String(raw || '').toUpperCase();
  if (u === 'SELF' || u === 'SELF_COLLECT') return 'SELF';
  if (u === 'STORE' || u === 'STORE_DELIVERY') return 'STORE_DELIVERY';
  if (u === 'PROVIDER' || u === 'DELIVERY_PROVIDER') return 'DELIVERY_PROVIDER';
  return u;
}

export function isStoreDeliveryType(raw?: string | null): boolean {
  return normalizeDeliveryType(raw) === 'STORE_DELIVERY';
}

function normalizeWorkflowStatus(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'pendingapproval') return 'PendingApproval';
  if (low === 'approved') return 'Approved';
  if (low === 'rejected') return 'Rejected';
  if (low === 'quoted') return 'Quoted';
  if (low === 'processing') return 'Processing';
  if (low === 'selfcollect') return 'SelfCollect';
  return s;
}

/** Store delivery waiting for branch to enter a delivery fee. */
export function isStoreDeliveryAwaitingBranchQuote(order: {
  deliveryType?: string | null;
  delivery?: { type?: string; status?: string; fee?: number };
  deliveryState?: string;
  deliveryFee?: number;
  deliveryQuote?: { fee?: number };
  deliveryPaid?: boolean;
  payment?: { deliveryPaid?: boolean };
}): boolean {
  if (!isStoreDeliveryType(order.deliveryType ?? order.delivery?.type)) return false;
  const deliveryPaid = order.deliveryPaid ?? order.payment?.deliveryPaid ?? false;
  if (deliveryPaid) return false;
  const status = normalizeWorkflowStatus(order.delivery?.status ?? order.deliveryState);
  if (status === 'Rejected' || status === 'Approved') return false;
  const fee = Math.max(
    0,
    Number(order.deliveryFee ?? order.delivery?.fee ?? order.deliveryQuote?.fee ?? 0) || 0
  );
  if (fee > 0) return false;
  return status === 'PendingApproval' || status === 'Processing' || status === '' || fee <= 0;
}

/** Store delivery quoted by branch — customer may pay. */
export function isStoreDeliveryQuotedUnpaid(order: {
  deliveryType?: string | null;
  delivery?: { type?: string; status?: string; fee?: number };
  deliveryState?: string;
  deliveryFee?: number;
  deliveryQuote?: { fee?: number };
  deliveryPaid?: boolean;
  payment?: { deliveryPaid?: boolean };
}): boolean {
  if (!isStoreDeliveryType(order.deliveryType ?? order.delivery?.type)) return false;
  const deliveryPaid = order.deliveryPaid ?? order.payment?.deliveryPaid ?? false;
  if (deliveryPaid) return false;
  const status = normalizeWorkflowStatus(order.delivery?.status ?? order.deliveryState);
  if (status === 'Rejected') return false;
  const fee = Math.max(
    0,
    Number(
      order.deliveryQuote?.fee ?? order.deliveryFee ?? order.delivery?.fee ?? 0
    ) || 0
  );
  return fee > 0;
}

export function isStoreDeliveryRejected(order: {
  deliveryType?: string | null;
  delivery?: { type?: string; status?: string };
  deliveryState?: string;
}): boolean {
  if (!isStoreDeliveryType(order.deliveryType ?? order.delivery?.type)) return false;
  const status = normalizeWorkflowStatus(order.delivery?.status ?? order.deliveryState);
  return status === 'Rejected';
}

function storeFeeApproved(order: {
  deliveryFee?: number;
  deliveryType?: string | null;
  delivery?: { fee?: number; status?: string };
  deliveryPaid?: boolean;
}): boolean {
  const dt = normalizeDeliveryType(order.deliveryType ?? order.delivery?.type);
  if (dt !== 'STORE_DELIVERY') return false;
  const fee = Math.max(0, Number(order.deliveryFee ?? order.delivery?.fee ?? 0) || 0);
  if (fee <= 0) return false;
  if (order.deliveryPaid) return true;
  const status = String(order.delivery?.status || '').trim();
  return ['Approved', 'Processing', 'InProgress', 'OnTheWay', 'Delivered'].includes(status);
}

/** Fee visible to customer — store delivery only after branch sets an approved price. */
export function resolveEffectiveDeliveryFee(order: {
  deliveryFee?: number;
  deliveryType?: string | null;
  delivery?: { fee?: number; status?: string; type?: string };
  finance?: { deliveryFee?: number };
  deliveryPaid?: boolean;
  deliveryState?: string;
  deliveryQuote?: { fee?: number };
  payment?: { deliveryPaid?: boolean };
}): number {
  const rawFee = Math.max(
    0,
    Number(order.deliveryFee ?? order.delivery?.fee ?? order.finance?.deliveryFee ?? 0) || 0
  );
  const dt = normalizeDeliveryType(order.deliveryType ?? order.delivery?.type);
  if (dt === 'STORE_DELIVERY') {
    if (order.deliveryPaid && rawFee > 0) return rawFee;
    if (isStoreDeliveryAwaitingBranchQuote(order)) return 0;
    if (isStoreDeliveryRejected(order)) return 0;
    if (rawFee > 0) return rawFee;
    return 0;
  }
  if (rawFee > 0) return rawFee;
  if (order.deliveryState === 'Quoted' || order.deliveryState === 'Approved') return rawFee;
  return rawFee;
}

/** Client-side fallback when API finance block is missing. */
export function buildOrderFinanceFromParts(input: {
  materialsSubtotal: number;
  deliveryFee?: number;
  deliveryType?: string | null;
  deliveryStatus?: string;
  platformCommission?: number | null;
  supplierEarning?: number | null;
  deliveryPaid?: boolean;
  materialsPaid?: boolean;
}): OrderFinanceBreakdown {
  const materialsSubtotal = Math.max(0, Number(input.materialsSubtotal) || 0);
  const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0);
  const deliveryType = normalizeDeliveryType(input.deliveryType);
  const useCombined =
    deliveryType === 'STORE_DELIVERY' &&
    deliveryFee > 0 &&
    (input.deliveryPaid ||
      ['Approved', 'Processing', 'InProgress', 'OnTheWay', 'Delivered'].includes(
        String(input.deliveryStatus || '')
      ));
  const commissionBasis = useCombined ? 'materials_plus_delivery' : 'materials_only';
  const orderGross = useCombined
    ? roundMoney(materialsSubtotal + deliveryFee)
    : roundMoney(materialsSubtotal);

  let platformCommission: number;
  let supplierNet: number;

  if (
    commissionBasis === 'materials_plus_delivery' &&
    input.deliveryPaid &&
    input.platformCommission != null &&
    Number.isFinite(Number(input.platformCommission))
  ) {
    platformCommission = roundMoney(Number(input.platformCommission));
    supplierNet =
      input.supplierEarning != null && Number.isFinite(Number(input.supplierEarning))
        ? roundMoney(Number(input.supplierEarning))
        : roundMoney(orderGross - platformCommission);
  } else if (commissionBasis === 'materials_plus_delivery') {
    platformCommission = roundMoney(orderGross * COMMISSION_RATE);
    supplierNet = roundMoney(orderGross - platformCommission);
  } else {
    platformCommission = roundMoney(materialsSubtotal * COMMISSION_RATE);
    supplierNet = roundMoney(materialsSubtotal - platformCommission);
  }

  return {
    materialsSubtotal,
    deliveryFee: useCombined ? deliveryFee : 0,
    orderGross,
    platformCommission,
    supplierNet,
    commissionBasis,
    deliveryPaid: input.deliveryPaid,
    materialsPaid: input.materialsPaid,
    deliveryType,
  };
}

export function resolveOrderFinance(order: {
  finance?: OrderFinanceBreakdown;
  materialsSubtotal?: number;
  deliveryFee?: number;
  deliveryType?: string;
  delivery?: { fee?: number; type?: string; status?: string };
  deliveryState?: string;
  platformCommission?: number;
  supplierEarning?: number;
  deliveryPaid?: boolean;
  payment?: { deliveryPaid?: boolean; materialsPaid?: boolean };
  items?: Array<{ qty: number; unitPrice: number }>;
}): OrderFinanceBreakdown {
  if (order.finance && Number.isFinite(order.finance.orderGross)) {
    return order.finance;
  }
  const materialsFromItems = Array.isArray(order.items)
    ? order.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0)
    : 0;
  const deliveryPaid = order.deliveryPaid ?? order.payment?.deliveryPaid;
  const effectiveFee = resolveEffectiveDeliveryFee({
    deliveryFee: order.deliveryFee,
    deliveryType: order.deliveryType ?? order.delivery?.type,
    delivery: order.delivery,
    deliveryPaid,
    deliveryState: order.deliveryState,
  });
  return buildOrderFinanceFromParts({
    materialsSubtotal: Number(order.materialsSubtotal ?? materialsFromItems) || 0,
    deliveryFee: effectiveFee,
    deliveryType: order.deliveryType ?? order.delivery?.type,
    deliveryStatus: order.delivery?.status ?? order.deliveryState,
    platformCommission: order.platformCommission,
    supplierEarning: order.supplierEarning,
    deliveryPaid,
    materialsPaid: order.payment?.materialsPaid,
  });
}
