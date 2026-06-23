import apiClient from '@/api/client';

export type DeviceSessionPayload = {
  browserFingerprint?: string;
  deviceFingerprint: string;
  userAgent?: string;
};

export async function reportDeviceContext(payload: DeviceSessionPayload): Promise<void> {
  try {
    await apiClient.post('/fraud/device-session', payload);
  } catch {
    /* non-blocking */
  }
}
