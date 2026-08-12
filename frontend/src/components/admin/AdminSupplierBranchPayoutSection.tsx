import { useQueries } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminBranchPayoutProfile } from '@/lib/api/admin';
import { gatewaySettlementLabel, payoutStatusBadgeClass, payoutVerificationLabel } from '@/lib/payoutBankingDisplay';
import { Landmark, Loader2 } from 'lucide-react';

type BranchRow = { id: string; name: string };

type Props = {
  supplierId: string;
  branches: BranchRow[];
};

export function AdminSupplierBranchPayoutSection({ supplierId, branches }: Props) {
  const queries = useQueries({
    queries: branches.map((b) => ({
      queryKey: ['admin', 'branch-payout', supplierId, b.id],
      queryFn: () => getAdminBranchPayoutProfile(supplierId, b.id),
      enabled: Boolean(supplierId && b.id),
    })),
  });

  if (!branches.length) return null;

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          Branch payout &amp; banking
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Branch</th>
              <th className="pb-2 pr-4 font-medium">Verification</th>
              <th className="pb-2 pr-4 font-medium">Gateway</th>
              <th className="pb-2 font-medium">Account</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch, idx) => {
              const q = queries[idx];
              const profile = q.data?.profile;
              const loading = q.isLoading;
              const supported = Boolean(q.data?.gatewaySettlementSupported);
              return (
                <tr key={branch.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3 pr-4 font-medium">{branch.name}</td>
                  <td className="py-3 pr-4">
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Badge className={payoutStatusBadgeClass(profile?.verificationStatus)}>
                        {payoutVerificationLabel(profile?.verificationStatus)}
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {loading
                      ? '…'
                      : gatewaySettlementLabel(supported, profile?.gatewaySettlementProfile)}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {loading
                      ? '…'
                      : profile?.isActive !== false && profile?.accountNumberMasked
                        ? `${profile.bankName} · ${profile.accountNumberMasked}`
                        : 'Not configured'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
