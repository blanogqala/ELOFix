import apiClient from '@/api/client';

export type FraudAlertStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FraudAlertType =
  | 'DUPLICATE_PHONE'
  | 'DUPLICATE_SA_ID'
  | 'DUPLICATE_COMPANY_REG'
  | 'DUPLICATE_BANK_ACCOUNT'
  | 'SUSPICIOUS_DEVICE'
  | 'HIGH_RISK_PROVIDER'
  | 'FLAGGED_CUSTOMER'
  | 'SUSPICIOUS_LOGIN'
  | 'FAKE_DOCUMENTATION';

export type FraudAlertRow = {
  id: string;
  alertType: FraudAlertType;
  severity: FraudSeverity;
  status: FraudAlertStatus;
  description: string;
  createdAt: string;
  reviewedAt?: string | null;
  user?: { id: string; name: string; email: string; role: string } | null;
  provider?: {
    id: string;
    userId: string;
    businessName?: string | null;
    user?: { id: string; name: string; email: string };
  } | null;
};

export type FraudCenterSummary = {
  duplicatePhones: number;
  duplicateIds: number;
  duplicateCompanies: number;
  duplicateBanks: number;
  suspiciousDevices: number;
  highRiskProviders: number;
  flaggedCustomers: number;
  fraudAlerts: number;
};

export async function getFraudCenterSummary(): Promise<FraudCenterSummary> {
  const { data } = await apiClient.get<{ success: boolean; summary: FraudCenterSummary }>(
    '/admin/fraud-center/summary'
  );
  return data.summary;
}

export async function listFraudAlerts(params?: {
  status?: string;
  severity?: string;
  alertType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: FraudAlertRow[]; total: number }> {
  const { data } = await apiClient.get<{ success: boolean; items: FraudAlertRow[]; total: number }>(
    '/admin/fraud-alerts',
    { params }
  );
  return { items: data.items, total: data.total };
}

export async function getFraudAlert(id: string): Promise<FraudAlertRow> {
  const { data } = await apiClient.get<{ success: boolean; alert: FraudAlertRow }>(
    `/admin/fraud-alerts/${id}`
  );
  return data.alert;
}

export async function updateFraudAlert(
  id: string,
  body: { status: FraudAlertStatus; notes?: string }
): Promise<FraudAlertRow> {
  const { data } = await apiClient.patch<{ success: boolean; alert: FraudAlertRow }>(
    `/admin/fraud-alerts/${id}`,
    body
  );
  return data.alert;
}

export async function getFraudSuspiciousDevices() {
  const { data } = await apiClient.get<{ success: boolean; items: unknown[] }>(
    '/admin/fraud-center/suspicious-devices'
  );
  return data.items;
}

export async function getFraudDeviceDetail(id: string) {
  const { data } = await apiClient.get<{ success: boolean; device: unknown; accounts: unknown[]; alerts: FraudAlertRow[] }>(
    `/admin/fraud-center/devices/${id}`
  );
  return data;
}

export async function patchProviderFraudReview(userId: string, status: 'CLEARED' | 'REJECTED') {
  const { data } = await apiClient.patch(`/admin/fraud-center/providers/${userId}/fraud-review`, {
    status,
  });
  return data;
}
