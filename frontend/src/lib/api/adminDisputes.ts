import apiClient from '@/api/client';
import type { JobCompletionEvidence, JobDispute, JobDisputeRound } from '@/types';

export interface AdminDisputeRow extends JobDispute {
  customerName?: string;
  providerName?: string;
  jobTitle?: string;
  jobCategory?: string;
}

export async function listAdminDisputes(params?: {
  search?: string;
  status?: string;
  requestedResolution?: string;
}): Promise<{ disputes: AdminDisputeRow[] }> {
  const { data } = await apiClient.get<{ success: boolean; disputes: AdminDisputeRow[] }>(
    '/admin/disputes',
    { params }
  );
  return { disputes: data?.disputes ?? [] };
}

export async function getAdminDisputeDetail(id: string) {
  const { data } = await apiClient.get<{
    success: boolean;
    dispute: AdminDisputeRow;
    messages: JobDispute['messages'];
    resolutionLogs: Array<{
      id: string;
      adminId: string;
      action: string;
      amount: number | null;
      notes: string | null;
      createdAt: string;
    }>;
    job: unknown;
    completionEvidence: JobCompletionEvidence | null;
    rounds?: JobDisputeRound[];
  }>(`/admin/disputes/${id}`);
  return data;
}

export async function updateAdminDisputeStatus(
  id: string,
  status: string,
  adminNotes?: string
) {
  const { data } = await apiClient.patch(`/admin/disputes/${id}/status`, { status, adminNotes });
  return data;
}

export async function resolveAdminDispute(
  id: string,
  payload: { action: string; amount?: number; notes?: string }
) {
  const { data } = await apiClient.post(`/admin/disputes/${id}/resolve`, payload);
  return data;
}

export async function getAdminJobCompletionEvidence(jobId: string) {
  const { data } = await apiClient.get<{ success: boolean; evidence: JobCompletionEvidence | null }>(
    `/admin/jobs/${jobId}/completion-evidence`
  );
  return data?.evidence ?? null;
}

export function adminCompletionEvidenceExportUrl(jobId: string): string {
  const base = import.meta.env.VITE_API_URL || '/api';
  return `${base}/admin/jobs/${jobId}/completion-evidence/export`;
}
