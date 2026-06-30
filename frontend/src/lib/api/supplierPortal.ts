import apiClient from '@/api/client';
import type { MaterialFulfillmentStatus, Product, SupplierAccountProfile, SupplierBranchProfile } from '@/types';

export interface SupplierMaterialOrderLine {
  id: string;
  userId: string;
  storeId?: string;
  branchId?: string;
  storeName?: string;
  items?: Array<Record<string, unknown>>;
  total?: number;
  fulfillmentStatus?: MaterialFulfillmentStatus | string;
  materialsSubtotal?: number;
  platformCommission?: number;
  supplierEarning?: number;
  createdAt?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string | null;
  customerAddress?: string;
  customerLocation?: {
    address?: string;
    city?: string;
    area?: string;
    suburb?: string;
    coordinates?: { lat: number; lng: number };
  };
  cancelledBy?: 'supplier' | 'customer' | string;
  cancellationReason?: string;
  cancelledAt?: string;
  refundStatus?: string;
  refundAmount?: number;
  refundProcessedAt?: string;
  branchDeliveryFee?: number;
  branchHasDelivery?: boolean;
  deliveryRejection?: { reason?: string; rejectedAt?: string };
  deliveryQuote?: { fee?: number; note?: string };
  commissionReversed?: number;
  /** Job materials payment pipeline */
  jobId?: string;
  source?: string;
  deliveryType?: string;
  deliveryFee?: number;
  deliveryProviderId?: string;
  deliveryProviderName?: string;
  deliveryProviderPhone?: string;
  deliveryProviderEmail?: string;
  activeTrackingId?: string;
  activeTrackingToken?: string;
  delivery?: Record<string, unknown> & { status?: string; fee?: number };
  finance?: {
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
  supplierActivity?: Array<{
    type: string;
    status?: string;
    message?: string;
    actor?: string;
    reason?: string;
    createdAt?: string;
  }>;
  paymentStatus?: string;
  customerIssueFlag?: boolean;
  customerDeliveryIssue?: {
    reason: string;
    details?: string;
    reportedAt: string;
    status: string;
  };
}

export async function getSupplierMe(): Promise<SupplierAccountProfile | null> {
  const { data } = await apiClient.get<{ success: boolean; profile: SupplierAccountProfile | null }>(
    '/supplier/me'
  );
  return data?.profile ?? null;
}

export async function getSupplierOrders(
  status?: string,
  filters?: { from?: string; to?: string; branchId?: string }
): Promise<SupplierMaterialOrderLine[]> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (filters?.from) params.from = filters.from;
  if (filters?.to) params.to = filters.to;
  if (filters?.branchId) params.branchId = filters.branchId;
  const { data } = await apiClient.get<{ success: boolean; orders: SupplierMaterialOrderLine[] }>(
    '/supplier/orders',
    Object.keys(params).length > 0 ? { params } : undefined
  );
  return Array.isArray(data?.orders) ? data.orders : [];
}

export async function postSupplierEnsureTracking(
  orderId: string
): Promise<{ activeTrackingId: string; activeTrackingToken?: string }> {
  const { data } = await apiClient.post<{
    success: boolean;
    activeTrackingId: string;
    activeTrackingToken?: string;
  }>(`/supplier/orders/${encodeURIComponent(orderId)}/tracking/start`, {});
  if (!data?.activeTrackingId) throw new Error('Could not start tracking');
  return { activeTrackingId: data.activeTrackingId, activeTrackingToken: data.activeTrackingToken };
}

export async function patchSupplierOrderFulfillment(
  orderId: string,
  status: MaterialFulfillmentStatus
): Promise<SupplierMaterialOrderLine> {
  const { data } = await apiClient.patch<{ success: boolean; order: SupplierMaterialOrderLine }>(
    `/supplier/orders/${orderId}/fulfillment`,
    { status }
  );
  if (!data?.order) throw new Error('Fulfillment update failed');
  return data.order;
}

export async function patchSupplierDeliveryApprove(
  orderId: string,
  body: { fee: number; note?: string }
): Promise<SupplierMaterialOrderLine> {
  const { data } = await apiClient.patch<{ success: boolean; order: SupplierMaterialOrderLine }>(
    `/supplier/orders/${encodeURIComponent(orderId)}/delivery/approve`,
    body
  );
  if (!data?.order) throw new Error('Delivery approval failed');
  return data.order;
}

export async function patchSupplierDeliveryReject(
  orderId: string,
  reason?: string
): Promise<SupplierMaterialOrderLine> {
  const { data } = await apiClient.patch<{ success: boolean; order: SupplierMaterialOrderLine }>(
    `/supplier/orders/${encodeURIComponent(orderId)}/delivery/reject`,
    { reason }
  );
  if (!data?.order) throw new Error('Delivery rejection failed');
  return data.order;
}

export async function postSupplierOrderNote(orderId: string, message: string): Promise<SupplierMaterialOrderLine> {
  const { data } = await apiClient.post<{ success: boolean; order: SupplierMaterialOrderLine }>(
    `/supplier/orders/${orderId}/notes`,
    { message }
  );
  if (!data?.order) throw new Error('Note failed');
  return data.order;
}

export async function cancelSupplierOrder(orderId: string, reason: string): Promise<{
  order: SupplierMaterialOrderLine;
  refund: { amount: number; status: string; processedAt?: string };
}> {
  const { data } = await apiClient.post<{
    success: boolean;
    order: SupplierMaterialOrderLine;
    refund: { amount: number; status: string; processedAt?: string };
  }>(`/supplier/orders/${encodeURIComponent(orderId)}/cancel`, { reason });
  if (!data?.order) throw new Error('Cancel order failed');
  return { order: data.order, refund: data.refund };
}

export interface SupplierOrdersExportRow {
  orderId: string;
  branchName?: string | null;
  status: string;
  totalAmount: number;
  commission: number;
  netEarnings: number;
  revenueImpact: number;
  commissionImpact: number;
  netImpact: number;
  isCancelled: boolean;
  isCompletedPaid?: boolean;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  createdAt?: string | null;
  refundAmount?: number;
  refundStatus?: string | null;
}

export interface SupplierOrdersExportSummary {
  orderCount: number;
  cancelledCount: number;
  completedCount: number;
  pendingCount: number;
  completedRevenue: number;
  completedCommission: number;
  completedNet: number;
  activeRevenue: number;
  activeCommission: number;
  activeNet: number;
  cancelledRevenueAdjustment: number;
  cancelledCommissionAdjustment: number;
  cancelledNetAdjustment: number;
  totalRevenueImpact: number;
  totalCommissionImpact: number;
  totalNetImpact: number;
}

export const EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY: SupplierOrdersExportSummary = {
  orderCount: 0,
  cancelledCount: 0,
  completedCount: 0,
  pendingCount: 0,
  completedRevenue: 0,
  completedCommission: 0,
  completedNet: 0,
  activeRevenue: 0,
  activeCommission: 0,
  activeNet: 0,
  cancelledRevenueAdjustment: 0,
  cancelledCommissionAdjustment: 0,
  cancelledNetAdjustment: 0,
  totalRevenueImpact: 0,
  totalCommissionImpact: 0,
  totalNetImpact: 0,
};

export async function getSupplierOrdersExport(filters?: { from?: string; to?: string; branchId?: string }): Promise<{
  rows: SupplierOrdersExportRow[];
  summary: SupplierOrdersExportSummary;
}> {
  const { data } = await apiClient.get<{
    success: boolean;
    rows: SupplierOrdersExportRow[];
    summary: SupplierOrdersExportSummary;
  }>('/supplier/orders/export', {
    params: {
      ...(filters?.from ? { from: filters.from } : {}),
      ...(filters?.to ? { to: filters.to } : {}),
      ...(filters?.branchId ? { branchId: filters.branchId } : {}),
    },
  });
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    summary: data?.summary || { ...EMPTY_SUPPLIER_ORDERS_EXPORT_SUMMARY },
  };
}

export async function uploadSupplierProductImage(file: File): Promise<{ fileId: string; url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await apiClient.post<{ success: boolean; fileId: string; url: string }>(
    '/supplier/products/upload-image',
    fd
  );
  if (!data?.url) throw new Error('Upload failed');
  return { fileId: data.fileId, url: data.url };
}

export async function uploadSupplierProfileLogo(
  file: File
): Promise<{ fileId: string; url: string; profile: SupplierAccountProfile }> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await apiClient.post<{
    success: boolean;
    fileId: string;
    url: string;
    profile: SupplierAccountProfile;
  }>('/supplier/profile/upload-logo', fd);
  if (!data?.url || !data?.profile) throw new Error('Upload failed');
  return { fileId: data.fileId, url: data.url, profile: data.profile };
}

export async function postSupplierProduct(
  product: Partial<Product> & { name: string; category: string; price: number; branchId: string }
) {
  const { data } = await apiClient.post<{ success: boolean; supplier: SupplierAccountProfile }>(
    '/supplier/products',
    product
  );
  return data?.supplier ?? null;
}

export async function patchSupplierProduct(
  productId: string,
  patch: Partial<Product> & { branchId?: string }
) {
  const { data } = await apiClient.patch<{ success: boolean; supplier: SupplierAccountProfile }>(
    `/supplier/products/${productId}`,
    patch
  );
  return data?.supplier ?? null;
}

export async function deleteSupplierProduct(productId: string, branchId: string) {
  const { data } = await apiClient.delete<{ success: boolean; supplier: SupplierAccountProfile }>(
    `/supplier/products/${productId}`,
    { params: { branchId } }
  );
  return data?.supplier ?? null;
}

export interface SupplierInventoryCategoryRow {
  id: string;
  /** normalized lowercase unique name */
  name: string;
}

export async function getSupplierInventoryCategories(branchId: string): Promise<SupplierInventoryCategoryRow[]> {
  const { data } = await apiClient.get<{ success: boolean; categories: SupplierInventoryCategoryRow[] }>(
    '/supplier/inventory/categories',
    { params: { branchId } }
  );
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function postSupplierInventoryCategory(
  name: string,
  branchId: string
): Promise<SupplierInventoryCategoryRow> {
  const { data } = await apiClient.post<{ success: boolean; category: SupplierInventoryCategoryRow }>(
    '/supplier/inventory/categories',
    { name },
    { params: { branchId } }
  );
  if (!data?.category) throw new Error('Failed to create category');
  return data.category;
}

export interface SupplierBranchCreateBody {
  name: string;
  address?: string;
  city?: string;
  area?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  branchPhone?: string | null;
  branchEmail?: string | null;
  hasDelivery?: boolean;
  deliveryFee?: number;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
}

export async function getSupplierBranch(branchId: string): Promise<SupplierBranchProfile | null> {
  const { data } = await apiClient.get<{ success: boolean; branch: SupplierBranchProfile }>(
    `/supplier/branches/${encodeURIComponent(branchId)}`
  );
  return data?.branch ?? null;
}

export async function getSupplierBranches(): Promise<SupplierBranchProfile[]> {
  const { data } = await apiClient.get<{ success: boolean; branches: SupplierBranchProfile[] }>('/supplier/branches');
  return Array.isArray(data?.branches) ? data.branches : [];
}

export async function postSupplierBranch(body: SupplierBranchCreateBody): Promise<SupplierBranchProfile | null> {
  const { data } = await apiClient.post<{ success: boolean; branch: SupplierBranchProfile }>(
    '/supplier/branches',
    body
  );
  return data?.branch ?? null;
}

export interface SupplierBranchPortalUser {
  id: string;
  branchId: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  createdAt?: string;
}

export async function getSupplierBranchUsers(branchId: string): Promise<SupplierBranchPortalUser[]> {
  const { data } = await apiClient.get<{ success: boolean; users: SupplierBranchPortalUser[] }>(
    `/supplier/branches/${encodeURIComponent(branchId)}/users`
  );
  return Array.isArray(data?.users) ? data.users : [];
}

export async function postSupplierBranchUser(
  branchId: string,
  body: { email: string; password: string; role?: 'MANAGER' | 'STAFF' }
): Promise<SupplierBranchPortalUser | null> {
  const { data } = await apiClient.post<{ success: boolean; user: SupplierBranchPortalUser }>(
    `/supplier/branches/${encodeURIComponent(branchId)}/users`,
    body
  );
  return data?.user ?? null;
}

export async function patchSupplierBranchUser(
  branchId: string,
  branchUserId: string,
  body: Partial<{ email: string; password: string; role: 'MANAGER' | 'STAFF' }>
): Promise<SupplierBranchPortalUser | null> {
  try {
    const { data } = await apiClient.patch<{ success: boolean; user: SupplierBranchPortalUser }>(
      `/supplier/branches/${encodeURIComponent(branchId)}/users/${encodeURIComponent(branchUserId)}`,
      body
    );
    return data?.user ?? null;
  } catch (e: unknown) {
    const ax = e as { response?: { data?: { message?: string } }; message?: string };
    const msg = ax.response?.data?.message || ax.message || 'Could not update staff';
    throw new Error(msg);
  }
}

export async function deleteSupplierBranchUser(branchId: string, branchUserId: string): Promise<void> {
  try {
    await apiClient.delete(
      `/supplier/branches/${encodeURIComponent(branchId)}/users/${encodeURIComponent(branchUserId)}`
    );
  } catch (e: unknown) {
    const ax = e as { response?: { data?: { message?: string } }; message?: string };
    const msg = ax.response?.data?.message || ax.message || 'Could not remove staff';
    throw new Error(msg);
  }
}

export type SupplierBranchUpdateBody = Partial<
  Pick<
    SupplierBranchCreateBody,
    | 'name'
    | 'address'
    | 'city'
    | 'area'
    | 'contactPhone'
    | 'contactEmail'
    | 'branchPhone'
    | 'branchEmail'
    | 'hasDelivery'
    | 'deliveryFee'
    | 'latitude'
    | 'longitude'
    | 'isActive'
  >
>;

export async function patchSupplierBranch(
  branchId: string,
  body: SupplierBranchUpdateBody
): Promise<SupplierBranchProfile | null> {
  const { data } = await apiClient.patch<{ success: boolean; branch: SupplierBranchProfile }>(
    `/supplier/branches/${encodeURIComponent(branchId)}`,
    body
  );
  return data?.branch ?? null;
}

export async function deleteSupplierBranch(branchId: string): Promise<void> {
  try {
    await apiClient.delete(`/supplier/branches/${encodeURIComponent(branchId)}`);
  } catch (e: unknown) {
    const ax = e as { response?: { data?: { message?: string } }; message?: string };
    const msg = ax.response?.data?.message || ax.message || 'Could not delete branch';
    throw new Error(msg);
  }
}

export async function patchSupplierProfile(body: {
  businessName?: string;
  address?: string;
  phone?: string;
  storeDisplayName?: string;
  contactName?: string;
  accountPhone?: string;
  logo?: string | null;
  accountEmail?: string;
  hasDelivery?: boolean;
  deliveryFee?: number;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { data } = await apiClient.patch<{ success: boolean; profile: SupplierAccountProfile }>(
    '/supplier/profile',
    body
  );
  return data?.profile ?? null;
}

export interface SupplierAnalyticsOverview {
  totalBranches: number;
  sumNetEarningsAllBranches: number;
  sumPlatformCommissionAllBranches?: number;
  sumGrossRevenueAllBranches?: number;
  totalOrders: number;
  totalPendingOrders: number;
}

export async function getSupplierAnalyticsOverview(): Promise<SupplierAnalyticsOverview | null> {
  const { data } = await apiClient.get<
    { success: boolean } & Partial<SupplierAnalyticsOverview>
  >('/supplier/analytics/overview');
  if (!data?.success) return null;
  return {
    totalBranches: data.totalBranches ?? 0,
    sumNetEarningsAllBranches: data.sumNetEarningsAllBranches ?? 0,
    sumPlatformCommissionAllBranches: data.sumPlatformCommissionAllBranches ?? 0,
    sumGrossRevenueAllBranches: data.sumGrossRevenueAllBranches ?? 0,
    totalOrders: data.totalOrders ?? 0,
    totalPendingOrders: data.totalPendingOrders ?? 0,
  };
}

export interface SupplierBranchAnalyticsRow {
  branchId: string;
  name: string;
  city?: string;
  area?: string;
  address?: string;
  isActive: boolean;
  totalOrders: number;
  pendingOrders: number;
  netEarnings: number;
  platformCommission?: number;
  grossRevenue?: number;
  availableWithdrawals?: number;
  managerEmails?: string[];
}

export interface SupplierAnalyticsBranchesResult {
  branches: SupplierBranchAnalyticsRow[];
  totalAvailableWithdrawals: number;
}

export async function getSupplierAnalyticsBranches(params?: {
  city?: string;
  q?: string;
  from?: string;
  to?: string;
}): Promise<SupplierAnalyticsBranchesResult> {
  const { data } = await apiClient.get<{
    success: boolean;
    branches: SupplierBranchAnalyticsRow[];
    totalAvailableWithdrawals?: number;
  }>('/supplier/analytics/branches', { params: { ...params } });
  return {
    branches: Array.isArray(data?.branches) ? data.branches : [],
    totalAvailableWithdrawals: Number(data?.totalAvailableWithdrawals ?? 0),
  };
}

export interface SupplierBranchInventoryInsightProduct {
  id: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  unitsSold: number;
  unitsAddedApprox: number | null;
}

export async function getSupplierAnalyticsBranchInventory(branchId: string): Promise<{
  branchId: string;
  products: SupplierBranchInventoryInsightProduct[];
  categories: string[];
} | null> {
  const { data } = await apiClient.get<{
    success: boolean;
    branchId: string;
    products: SupplierBranchInventoryInsightProduct[];
    categories: string[];
  }>(`/supplier/analytics/branch/${encodeURIComponent(branchId)}/inventory`);
  if (!data?.success) return null;
  return {
    branchId: data.branchId,
    products: data.products ?? [],
    categories: data.categories ?? [],
  };
}

export async function patchBranchStaffProfile(body: {
  address?: string | null;
  city?: string | null;
  area?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  hasDelivery?: boolean;
  deliveryFee?: number;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<SupplierAccountProfile | null> {
  const { data } = await apiClient.patch<{ success: boolean; profile: SupplierAccountProfile }>(
    '/supplier/branch/me',
    body
  );
  return data?.profile ?? null;
}

function branchIdempotencyHeaders(): { 'Idempotency-Key': string } {
  const uuid =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { 'Idempotency-Key': uuid };
}

export interface BranchBalanceSnapshot {
  totalEarned: number;
  totalWithdrawn: number;
  withdrawalCap: number;
  available: number;
}

export interface BranchWithdrawalProfile {
  id: string;
  branchId: string;
  bankName: string;
  accountHolder: string;
  accountNumberMasked: string;
  branchCodeMasked: string;
  updatedAt: string;
}

export interface BranchWithdrawalRow {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export async function getBranchBalance(branchId: string): Promise<BranchBalanceSnapshot> {
  const { data } = await apiClient.get<{ success: boolean } & BranchBalanceSnapshot>(
    `/supplier/branches/${encodeURIComponent(branchId)}/balance`
  );
  return {
    totalEarned: data.totalEarned ?? 0,
    totalWithdrawn: data.totalWithdrawn ?? 0,
    withdrawalCap: data.withdrawalCap ?? 0,
    available: data.available ?? 0,
  };
}

export async function getBranchWithdrawalProfile(
  branchId: string
): Promise<{ success: boolean; profile: BranchWithdrawalProfile | null }> {
  const { data } = await apiClient.get<{ success: boolean; profile: BranchWithdrawalProfile | null }>(
    `/supplier/branches/${encodeURIComponent(branchId)}/withdrawal-profile`
  );
  return data;
}

export async function saveBranchWithdrawalProfile(
  branchId: string,
  body: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    branchCode: string;
  }
): Promise<{ success: boolean; profile: BranchWithdrawalProfile }> {
  const { data } = await apiClient.put<{ success: boolean; profile: BranchWithdrawalProfile }>(
    `/supplier/branches/${encodeURIComponent(branchId)}/withdrawal-profile`,
    body
  );
  return data;
}

export async function requestBranchWithdrawal(
  branchId: string,
  amount: number
): Promise<{
  success: boolean;
  withdrawal: { id: string; amount: number; status: string; createdAt: string };
}> {
  const { data } = await apiClient.post(
    `/supplier/branches/${encodeURIComponent(branchId)}/withdraw`,
    { amount },
    { headers: branchIdempotencyHeaders() }
  );
  return data;
}

export async function getBranchWithdrawals(
  branchId: string,
  filters?: { from?: string; to?: string }
): Promise<{ success: boolean; withdrawals: BranchWithdrawalRow[] }> {
  const params: Record<string, string> = {};
  if (filters?.from) params.from = filters.from;
  if (filters?.to) params.to = filters.to;
  const { data } = await apiClient.get<{ success: boolean; withdrawals: BranchWithdrawalRow[] }>(
    `/supplier/branches/${encodeURIComponent(branchId)}/withdrawals`,
    Object.keys(params).length > 0 ? { params } : undefined
  );
  return {
    success: Boolean(data?.success),
    withdrawals: Array.isArray(data?.withdrawals) ? data.withdrawals : [],
  };
}

export interface SupplierOrgWithdrawalRow {
  id: string;
  branchId: string;
  branchName: string;
  amount: number;
  status: string;
  createdAt: string;
}

export async function getSupplierOrgBranchWithdrawals(filters?: {
  from?: string;
  to?: string;
  branchId?: string;
}): Promise<{ success: boolean; withdrawals: SupplierOrgWithdrawalRow[] }> {
  const params: Record<string, string> = {};
  if (filters?.from) params.from = filters.from;
  if (filters?.to) params.to = filters.to;
  if (filters?.branchId) params.branchId = filters.branchId;
  const { data } = await apiClient.get<{ success: boolean; withdrawals: SupplierOrgWithdrawalRow[] }>(
    '/supplier/branch-withdrawals',
    Object.keys(params).length > 0 ? { params } : undefined
  );
  return {
    success: Boolean(data?.success),
    withdrawals: Array.isArray(data?.withdrawals) ? data.withdrawals : [],
  };
}
