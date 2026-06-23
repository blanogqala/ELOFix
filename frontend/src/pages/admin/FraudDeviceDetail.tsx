import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { TrustLevelBadge } from '@/components/fraud/TrustLevelBadge';
import { FraudAlertBadge, formatAlertType } from '@/components/fraud/FraudAlertBadge';
import { getFraudDeviceDetail } from '@/lib/api/adminFraud';
import { ArrowLeft } from 'lucide-react';

type DeviceAccount = {
  userId: string;
  name: string;
  email: string;
  role: string;
  loginCount: number;
  lastLoginAt: string;
  providerProfile?: {
    businessName?: string;
    trustScore: number;
    trustLevel: { id: string; label: string };
  } | null;
};

export default function FraudDeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);
  const [alerts, setAlerts] = useState<Array<{ id: string; alertType: string; description: string; status: string }>>([]);

  useEffect(() => {
    if (!id) return;
    void getFraudDeviceDetail(id).then((data) => {
      setDevice(data.device as Record<string, unknown>);
      setAccounts((data.accounts || []) as DeviceAccount[]);
      setAlerts((data.alerts || []) as typeof alerts);
    });
  }, [id]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/fraud-center')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Fraud Center
        </Button>

        <div className="card-elevated p-6 space-y-2">
          <h1 className="text-xl font-bold">Device intelligence</h1>
          {device && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mt-4">
              <div><dt className="text-muted-foreground">OS</dt><dd>{String(device.os || '—')}</dd></div>
              <div><dt className="text-muted-foreground">IP</dt><dd>{String(device.ipAddress || '—')}</dd></div>
              <div><dt className="text-muted-foreground">Country</dt><dd>{String(device.country || '—')}</dd></div>
              <div><dt className="text-muted-foreground">City</dt><dd>{String(device.city || '—')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Fingerprint</dt><dd className="font-mono text-xs break-all">{String(device.deviceFingerprint || '')}</dd></div>
            </dl>
          )}
        </div>

        <div className="card-elevated p-6">
          <h2 className="font-semibold mb-4">Accounts linked ({accounts.length})</h2>
          <div className="space-y-3">
            {accounts.map((a) => (
              <div key={a.userId} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground">{a.role}</span>
                  {a.providerProfile && (
                    <TrustLevelBadge
                      level={a.providerProfile.trustLevel as { id: 'elite'; label: string }}
                      score={a.providerProfile.trustScore}
                    />
                  )}
                </div>
                <p className="text-muted-foreground">{a.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {a.loginCount} logins · last {new Date(a.lastLoginAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card-elevated p-6">
          <h2 className="font-semibold mb-4">Alert history</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts for this device.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatAlertType(a.alertType)}</span>
                    <FraudAlertBadge status={a.status as 'OPEN'} />
                  </div>
                  <p className="text-muted-foreground mt-1">{a.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
