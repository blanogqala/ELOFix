import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Landmark } from 'lucide-react';
import {
  gatewaySettlementLabel,
  payoutStatusBadgeClass,
  payoutVerificationLabel,
} from '@/lib/payoutBankingDisplay';

export type AdminPayoutProfile = {
  scope?: string;
  entityId?: string;
  bankName?: string;
  accountHolder?: string;
  accountType?: string | null;
  accountNumberMasked?: string;
  branchCodeMasked?: string;
  verificationStatus?: string;
  gatewaySettlementProfile?: {
    status?: string | null;
    provider?: string | null;
    recipientConfigured?: boolean;
  };
  isActive?: boolean;
  updatedAt?: string;
};

type Props = {
  title?: string;
  loadProfile: () => Promise<{
    profile: AdminPayoutProfile | null;
    gatewaySettlementSupported?: boolean;
  }>;
};

export function AdminPayoutBankingCard({ title = 'Payout & Banking', loadProfile }: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AdminPayoutProfile | null>(null);
  const [gatewaySupported, setGatewaySupported] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadProfile();
      setProfile(data.profile);
      setGatewaySupported(Boolean(data.gatewaySettlementSupported));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !profile || profile.isActive === false ? (
          <p className="text-muted-foreground">No payout bank profile configured.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Verification</span>
              <Badge className={payoutStatusBadgeClass(profile.verificationStatus)}>
                {payoutVerificationLabel(profile.verificationStatus)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Gateway settlement</span>
              <Badge variant="outline">
                {gatewaySettlementLabel(gatewaySupported, profile.gatewaySettlementProfile)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {profile.bankName} · {profile.accountHolder} · {profile.accountNumberMasked}
              {profile.branchCodeMasked ? ` · branch ${profile.branchCodeMasked}` : ''}
              {profile.accountType ? ` · ${profile.accountType}` : ''}
            </p>
            {profile.updatedAt ? (
              <p className="text-xs text-muted-foreground">Updated {new Date(profile.updatedAt).toLocaleString()}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
