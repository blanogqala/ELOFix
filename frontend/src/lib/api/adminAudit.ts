import apiClient from '@/api/client';

export interface AdminAuditLogRow {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  actorType: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListAdminAuditLogsParams {
  search?: string;
  entityType?: string;
  actionCategory?: string;
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listAdminAuditLogs(params?: ListAdminAuditLogsParams) {
  const { data } = await apiClient.get<{
    success: boolean;
    items: AdminAuditLogRow[];
    total: number;
  }>('/admin/audit-logs', { params });
  return data;
}

export async function exportAdminAuditLogsCsv(params?: ListAdminAuditLogsParams): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/admin/audit-logs/export', {
    params: { ...params, format: 'csv' },
    responseType: 'blob',
  });
  return data;
}
