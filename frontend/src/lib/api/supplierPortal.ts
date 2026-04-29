import apiClient from '@/api/client';
import type { MaterialFulfillmentStatus, Product, SupplierAccountProfile } from '@/types';

export interface SupplierMaterialOrderLine {
  id: string;
  userId: string;
  storeId?: string;
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
  /** Job materials payment pipeline */
  jobId?: string;
  source?: string;
  deliveryType?: string;
  delivery?: Record<string, unknown>;
  supplierActivity?: Array<{
    type: string;
    status?: string;
    message?: string;
    createdAt?: string;
  }>;
  paymentStatus?: string;
}

export async function getSupplierMe(): Promise<SupplierAccountProfile | null> {
  const { data } = await apiClient.get<{ success: boolean; profile: SupplierAccountProfile | null }>(
    '/supplier/me'
  );
  return data?.profile ?? null;
}

export async function getSupplierOrders(status?: string): Promise<SupplierMaterialOrderLine[]> {
  const { data } = await apiClient.get<{ success: boolean; orders: SupplierMaterialOrderLine[] }>(
    '/supplier/orders',
    status ? { params: { status } } : undefined
  );
  return Array.isArray(data?.orders) ? data.orders : [];
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

export async function postSupplierOrderNote(orderId: string, message: string): Promise<SupplierMaterialOrderLine> {
  const { data } = await apiClient.post<{ success: boolean; order: SupplierMaterialOrderLine }>(
    `/supplier/orders/${orderId}/notes`,
    { message }
  );
  if (!data?.order) throw new Error('Note failed');
  return data.order;
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

export async function postSupplierProduct(product: Partial<Product> & { name: string; category: string; price: number }) {
  const { data } = await apiClient.post<{ success: boolean; supplier: SupplierAccountProfile }>(
    '/supplier/products',
    product
  );
  return data?.supplier ?? null;
}

export async function patchSupplierProduct(productId: string, patch: Partial<Product>) {
  const { data } = await apiClient.patch<{ success: boolean; supplier: SupplierAccountProfile }>(
    `/supplier/products/${productId}`,
    patch
  );
  return data?.supplier ?? null;
}

export async function deleteSupplierProduct(productId: string) {
  const { data } = await apiClient.delete<{ success: boolean; supplier: SupplierAccountProfile }>(
    `/supplier/products/${productId}`
  );
  return data?.supplier ?? null;
}

export interface SupplierInventoryCategoryRow {
  id: string;
  /** normalized lowercase unique name */
  name: string;
}

export async function getSupplierInventoryCategories(): Promise<SupplierInventoryCategoryRow[]> {
  const { data } = await apiClient.get<{ success: boolean; categories: SupplierInventoryCategoryRow[] }>(
    '/supplier/inventory/categories'
  );
  return Array.isArray(data?.categories) ? data.categories : [];
}

export async function postSupplierInventoryCategory(name: string): Promise<SupplierInventoryCategoryRow> {
  const { data } = await apiClient.post<{ success: boolean; category: SupplierInventoryCategoryRow }>(
    '/supplier/inventory/categories',
    { name }
  );
  if (!data?.category) throw new Error('Failed to create category');
  return data.category;
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
}) {
  const { data } = await apiClient.patch<{ success: boolean; profile: SupplierAccountProfile }>(
    '/supplier/profile',
    body
  );
  return data?.profile ?? null;
}
