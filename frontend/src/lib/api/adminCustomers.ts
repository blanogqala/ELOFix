import apiClient from '@/api/client';
import type { AdminCustomerDetail, AdminCustomerListItem, AdminCustomerJobCounts } from '@/types';

function normalizeCustomerJobCounts(raw: Partial<AdminCustomerJobCounts> | undefined): AdminCustomerJobCounts {
  return {
    total: Number(raw?.total) || 0,
    completed: Number(raw?.completed) || 0,
    active: Number(raw?.active) || 0,
    disputed: Number(raw?.disputed) || 0,
    rejected: Number(raw?.rejected) || 0,
    cancelled: Number(raw?.cancelled) || 0,
  };
}

function normalizeCustomerListItem(customer: AdminCustomerListItem): AdminCustomerListItem {
  return {
    ...customer,
    jobCounts: normalizeCustomerJobCounts(customer.jobCounts),
  };
}

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
    customers: Array.isArray(data?.customers) ? data.customers.map(normalizeCustomerListItem) : [],
  };
}

export async function getAdminCustomerById(userId: string): Promise<AdminCustomerDetail> {
  const { data } = await apiClient.get<{ success: boolean; customer: AdminCustomerDetail }>(
    `/admin/customers/${userId}`,
  );
  if (!data?.customer) {
    throw new Error('Customer not found');
  }
  return {
    ...data.customer,
    jobCounts: normalizeCustomerJobCounts(data.customer.jobCounts),
  };
}

export async function blockAdminCustomer(userId: string, reason: string): Promise<AdminCustomerDetail> {
  const { data } = await apiClient.patch<{ success: boolean; customer: AdminCustomerDetail }>(
    `/admin/customers/${userId}/block`,
    { reason },
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
