import apiClient from '@/api/client';
import type { AdminCustomerDetail, AdminCustomerListItem } from '@/types';

export interface AdminCustomersListResponse {
  success: boolean;
  summary: {
    totalRegistered: number;
    totalRevenue: number;
  };
  customers: AdminCustomerListItem[];
}

export async function getAdminCustomers(params?: {
  search?: string;
  city?: string;
  status?: string;
}): Promise<AdminCustomersListResponse> {
  const { data } = await apiClient.get<AdminCustomersListResponse>('/admin/customers', { params });
  return {
    success: Boolean(data?.success),
    summary: data?.summary ?? { totalRegistered: 0, totalRevenue: 0 },
    customers: Array.isArray(data?.customers) ? data.customers : [],
  };
}

export async function getAdminCustomerById(userId: string): Promise<AdminCustomerDetail> {
  const { data } = await apiClient.get<{ success: boolean; customer: AdminCustomerDetail }>(
    `/admin/customers/${userId}`,
  );
  if (!data?.customer) {
    throw new Error('Customer not found');
  }
  return data.customer;
}

export async function blockAdminCustomer(userId: string): Promise<AdminCustomerDetail> {
  const { data } = await apiClient.patch<{ success: boolean; customer: AdminCustomerDetail }>(
    `/admin/customers/${userId}/block`,
  );
  if (!data?.customer) throw new Error('Failed to block customer');
  return data.customer;
}

export async function unblockAdminCustomer(userId: string): Promise<AdminCustomerDetail> {
  const { data } = await apiClient.patch<{ success: boolean; customer: AdminCustomerDetail }>(
    `/admin/customers/${userId}/unblock`,
  );
  if (!data?.customer) throw new Error('Failed to unblock customer');
  return data.customer;
}

export async function deleteAdminCustomer(userId: string): Promise<AdminCustomerDetail> {
  const { data } = await apiClient.patch<{ success: boolean; customer: AdminCustomerDetail }>(
    `/admin/customers/${userId}/delete`,
  );
  if (!data?.customer) throw new Error('Failed to delete customer');
  return data.customer;
}
