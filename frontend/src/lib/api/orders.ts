import apiClient from '@/api/client';
import type { SupplierMaterialOrderLine } from '@/lib/api/supplierPortal';

/**
 * GET /api/orders — Admin: all orders or filter by supplierId; Supplier: own orders (?status=)
 */
export async function listOrdersForActor(params?: {
  supplierId?: string;
  status?: string;
}): Promise<SupplierMaterialOrderLine[]> {
  const { data } = await apiClient.get<{ success: boolean; orders: SupplierMaterialOrderLine[] }>('/orders', {
    params,
  });
  return Array.isArray(data?.orders) ? data.orders : [];
}
