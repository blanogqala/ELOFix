import type { AdminAnalyticsSummary } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/formatCurrency';
import { KpiCard } from './KpiCard';
import {
  Users,
  HardHat,
  BadgeCheck,
  Clock,
  Store,
  Briefcase,
  DollarSign,
  Percent,
  Lock,
  AlertTriangle,
  Activity,
  Star,
} from 'lucide-react';

type ExecutiveKpiGridProps = {
  summary: AdminAnalyticsSummary;
};

function fmtRating(n?: number) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(1);
}

export function ExecutiveKpiGrid({ summary }: ExecutiveKpiGridProps) {
  const deltas = summary.deltas ?? {};

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-6">
      <KpiCard
        label="Customers"
        value={summary.totalCustomers ?? 0}
        icon={Users}
        iconClassName="bg-blue-500/10 text-blue-600"
        delta={deltas.totalCustomers}
      />
      <KpiCard
        label="Providers"
        value={summary.totalProviders ?? 0}
        icon={HardHat}
        iconClassName="bg-violet-500/10 text-violet-600"
        delta={deltas.totalProviders}
      />
      <KpiCard
        label="Verified Providers"
        value={summary.verifiedProviders ?? summary.activeApprovedProviders ?? 0}
        icon={BadgeCheck}
        iconClassName="bg-emerald-500/10 text-emerald-600"
      />
      <KpiCard
        label="Pending Verification"
        value={summary.pendingVerification ?? 0}
        icon={Clock}
        iconClassName="bg-amber-500/10 text-amber-600"
      />
      <KpiCard
        label="Suppliers"
        value={summary.totalSuppliers ?? 0}
        icon={Store}
        iconClassName="bg-cyan-500/10 text-cyan-600"
      />
      <KpiCard
        label="Jobs"
        value={summary.totalJobs}
        icon={Briefcase}
        iconClassName="bg-primary/10 text-primary"
        delta={deltas.totalJobs}
        subtitle="Created in range"
      />
      <KpiCard
        label="Revenue"
        value={formatCurrency(summary.totalRevenue)}
        icon={DollarSign}
        iconClassName="bg-emerald-500/10 text-emerald-600"
        delta={deltas.totalRevenue}
        subtitle="Gross customer payments"
      />
      <KpiCard
        label="Commission"
        value={formatCurrency(summary.totalCommission ?? 0)}
        icon={Percent}
        iconClassName="bg-accent/20 text-accent-foreground"
        delta={deltas.totalCommission}
      />
      <KpiCard
        label="Escrow Balance"
        value={formatCurrency(summary.escrowBalance ?? 0)}
        icon={Lock}
        iconClassName="bg-orange-500/10 text-orange-600"
        subtitle="Held funds"
      />
      <KpiCard
        label="Disputes"
        value={summary.openDisputes ?? 0}
        icon={AlertTriangle}
        iconClassName="bg-destructive/10 text-destructive"
        delta={deltas.disputesOpenedInRange}
        subtitle={`${summary.disputesOpenedInRange ?? 0} opened in range`}
      />
      <KpiCard
        label="Active Users"
        value={summary.activeUsers ?? 0}
        icon={Activity}
        iconClassName="bg-indigo-500/10 text-indigo-600"
        delta={deltas.activeUsers}
        subtitle="Logged in during range"
      />
      <KpiCard
        label="Average Rating"
        value={fmtRating(summary.averageRating)}
        icon={Star}
        iconClassName="bg-yellow-500/10 text-yellow-600"
        subtitle="Platform-wide"
      />
    </div>
  );
}
