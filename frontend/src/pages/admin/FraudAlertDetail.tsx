import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FraudAlertBadge, formatAlertType } from '@/components/fraud/FraudAlertBadge';
import {
  getFraudAlert,
  updateFraudAlert,
  type FraudAlertRow,
  type FraudAlertStatus,
} from '@/lib/api/adminFraud';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

export default function FraudAlertDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [alert, setAlert] = useState<FraudAlertRow | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getFraudAlert(id).then(setAlert).catch(() => setAlert(null));
  }, [id]);

  const updateStatus = async (status: FraudAlertStatus) => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateFraudAlert(id, { status, notes: notes || undefined });
      setAlert(updated);
      toast({ title: 'Alert updated', description: `Status set to ${status.replace(/_/g, ' ')}` });
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!alert) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading alert…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/fraud-center/alerts')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to alerts
        </Button>

        <div className="card-elevated p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{formatAlertType(alert.alertType)}</h1>
            <FraudAlertBadge severity={alert.severity} />
            <FraudAlertBadge status={alert.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Created {new Date(alert.createdAt).toLocaleString()}
          </p>
          <p>{alert.description}</p>

          {alert.user && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Linked user</p>
              <p>{alert.user.name} · {alert.user.email}</p>
            </div>
          )}
          {alert.provider && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Linked provider</p>
              <p>
                {alert.provider.user?.name || alert.provider.businessName} ·{' '}
                {alert.provider.user?.email}
              </p>
              <Button
                variant="link"
                className="px-0 h-auto"
                onClick={() => navigate(`/admin/providers/${alert.provider?.userId}`)}
              >
                Open provider profile
              </Button>
            </div>
          )}

          <Textarea
            placeholder="Review notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />

          <div className="flex flex-wrap gap-2">
            {(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] as FraudAlertStatus[]).map((s) => (
              <Button
                key={s}
                variant={alert.status === s ? 'default' : 'outline'}
                size="sm"
                disabled={saving}
                onClick={() => updateStatus(s)}
              >
                {s.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
