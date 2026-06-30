import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Fingerprint,
  Phone,
  ShieldAlert,
  UserX,
  Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { NotificationSkeleton } from '@/components/common/loading';
import { Button } from '@/components/ui/button';
import { FraudStatCard } from '@/components/fraud/FraudStatCard';
import { FraudAlertBadge, formatAlertType } from '@/components/fraud/FraudAlertBadge';
import { getFraudCenterSummary, listFraudAlerts, type FraudAlertRow } from '@/lib/api/adminFraud';

export default function FraudCenter() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    duplicatePhones: 0,
    duplicateIds: 0,
    duplicateCompanies: 0,
    duplicateBanks: 0,
    suspiciousDevices: 0,
    highRiskProviders: 0,
    flaggedCustomers: 0,
    fraudAlerts: 0,
  });
  const [alerts, setAlerts] = useState<FraudAlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, a] = await Promise.all([
          getFraudCenterSummary(),
          listFraudAlerts({ limit: 10 }),
        ]);
        if (!cancelled) {
          setSummary(s);
          setAlerts(a.items);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Fraud Center</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Identity fraud detection, device intelligence, and trust monitoring
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin/fraud-center/alerts')}>
            View all alerts
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FraudStatCard title="Duplicate Phones" value={summary.duplicatePhones} icon={Phone} />
          <FraudStatCard title="Duplicate IDs" value={summary.duplicateIds} icon={UserX} />
          <FraudStatCard title="Duplicate Companies" value={summary.duplicateCompanies} icon={Building2} />
          <FraudStatCard title="Duplicate Bank Accounts" value={summary.duplicateBanks} icon={CreditCard} />
          <FraudStatCard title="Suspicious Devices" value={summary.suspiciousDevices} icon={Fingerprint} />
          <FraudStatCard title="High Risk Providers" value={summary.highRiskProviders} icon={ShieldAlert} />
          <FraudStatCard title="Flagged Customers" value={summary.flaggedCustomers} icon={Users} />
          <FraudStatCard
            title="Fraud Alerts"
            value={summary.fraudAlerts}
            icon={AlertTriangle}
            onClick={() => navigate('/admin/fraud-center/alerts')}
          />
        </div>

        <div className="card-elevated p-6">
          <h2 className="font-semibold mb-4">Recent fraud alerts</h2>
          {loading ? (
            <NotificationSkeleton count={4} />
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open alerts.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  className="w-full text-left rounded-lg border p-4 hover:bg-muted/40 transition-colors"
                  onClick={() => navigate(`/admin/fraud-center/alerts/${alert.id}`)}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{formatAlertType(alert.alertType)}</span>
                    <FraudAlertBadge severity={alert.severity} />
                    <FraudAlertBadge status={alert.status} />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{alert.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
