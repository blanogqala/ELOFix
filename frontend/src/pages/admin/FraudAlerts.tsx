import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FraudAlertBadge, formatAlertType } from '@/components/fraud/FraudAlertBadge';
import { listFraudAlerts, type FraudAlertRow } from '@/lib/api/adminFraud';
import { ArrowLeft } from 'lucide-react';

export default function FraudAlerts() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FraudAlertRow[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await listFraudAlerts({
          status: status === 'all' ? undefined : status,
          limit: 100,
        });
        if (!cancelled) setItems(res.items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/fraud-center')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold">Fraud Alerts</h1>
        </div>

        <div className="flex items-center gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="card-elevated divide-y">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No alerts found.</p>
          ) : (
            items.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
                onClick={() => navigate(`/admin/fraud-center/alerts/${alert.id}`)}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium">{formatAlertType(alert.alertType)}</span>
                  <FraudAlertBadge severity={alert.severity} />
                  <FraudAlertBadge status={alert.status} />
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(alert.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{alert.description}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
