import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { getJobs } from '@/lib/api/jobs';
import { getCategories } from '@/lib/api/categories';
import { getAdminCommissions, getAdminPaymentObligations } from '@/lib/api/admin';
import { Category, Job } from '@/types';
import { DollarSign, Clock, CheckCircle, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  formatAdminCommissionBreakdown,
  getAdminEscrowV2Breakdown,
  getAdminJobLaborPaid,
  getAdminNetEscrowRemaining,
  getAdminNetPaidLaborProviderShare,
  getAdminNetPaidLaborReleasedAmount,
  isAdminPaidLaborProviderJob,
} from '@/lib/adminJobFinancial';
import { getAdminPaymentStatusDisplay, jobMatchesAdminPaymentStatusFilter, type AdminPaymentStatusFilter } from '@/lib/adminJobStatus';
import { safeMoney } from '@/lib/jobMoney';
import {
  ADMIN_FILTER_SELECT_CLASS,
  collectJobCities,
  jobMatchesAdminSearch,
  jobMatchesCategoryFilter,
  jobMatchesCityFilter,
} from '@/lib/adminJobFilters';

function rowFinancials(job: Job) {
  const fin = getAdminEscrowV2Breakdown(job);
  const laborPaid = getAdminJobLaborPaid(job);
  return {
    totalPrice: fin.totalPrice > 0 ? fin.totalPrice : laborPaid || safeMoney(job.servicePrice?.amount) || safeMoney(job.totalEstimateRange?.min),
    commission: fin.commission,
    provider: getAdminNetPaidLaborProviderShare(job),
    released: getAdminNetPaidLaborReleasedAmount(job),
    remaining: getAdminNetEscrowRemaining(job),
  };
}

export default function AdminPayments() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commissionBreakdown, setCommissionBreakdown] = useState({
    labor: 0,
    material: 0,
    total: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<AdminPaymentStatusFilter>('all');
  const [customerObligations, setCustomerObligations] = useState<
    Awaited<ReturnType<typeof getAdminPaymentObligations>>['customerObligations']
  >([]);
  const [providerRefundDebts, setProviderRefundDebts] = useState<
    Awaited<ReturnType<typeof getAdminPaymentObligations>>['providerRefundDebts']
  >([]);

  useEffect(() => {
    void loadJobs();
    void loadCategories();
  }, []);

  const loadJobs = async () => {
    try {
      const allJobs = await getJobs();
      setJobs(allJobs);
      try {
        const end = new Date();
        const toStr = (d: Date) => d.toISOString().slice(0, 10);
        const comm = await getAdminCommissions({ from: '2000-01-01', to: toStr(end) });
        const labor =
          typeof comm?.totalLaborCommission === 'number' && Number.isFinite(comm.totalLaborCommission)
            ? comm.totalLaborCommission
            : 0;
        const material =
          typeof comm?.totalMaterialCommission === 'number' && Number.isFinite(comm.totalMaterialCommission)
            ? comm.totalMaterialCommission
            : 0;
        const total =
          typeof comm?.totalCommission === 'number' && Number.isFinite(comm.totalCommission)
            ? comm.totalCommission
            : labor + material;
        setCommissionBreakdown({ labor, material, total });
      } catch {
        setCommissionBreakdown({ labor: 0, material: 0, total: 0 });
      }
      try {
        const debt = await getAdminPaymentObligations();
        setCustomerObligations(debt.customerObligations);
        setProviderRefundDebts(debt.providerRefundDebts);
      } catch {
        setCustomerObligations([]);
        setProviderRefundDebts([]);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      setCategories(await getCategories());
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    }
  };

  const cities = useMemo(() => collectJobCities(jobs), [jobs]);

  const activeFilters = [
    categoryFilter !== 'all' && {
      key: 'category',
      label: categories.find((c) => c.id === categoryFilter)?.name || categoryFilter,
    },
    cityFilter !== 'all' && { key: 'city', label: cityFilter },
    statusFilter !== 'all' && {
      key: 'status',
      label: statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1),
    },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearFilter = (key: string) => {
    if (key === 'category') setCategoryFilter('all');
    if (key === 'city') setCityFilter('all');
    if (key === 'status') setStatusFilter('all');
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch = jobMatchesAdminSearch(job, searchQuery);
      const matchesCategory = jobMatchesCategoryFilter(job, categoryFilter);
      const matchesCity = jobMatchesCityFilter(job, cityFilter);
      const matchesStatus = jobMatchesAdminPaymentStatusFilter(job, statusFilter);
      return matchesSearch && matchesCategory && matchesCity && matchesStatus;
    });
  }, [jobs, searchQuery, categoryFilter, cityFilter, statusFilter]);

  const paidLaborJobs = filteredJobs.filter(isAdminPaidLaborProviderJob);
  const completedPaidJobs = paidLaborJobs.filter((j) => j.status === 'COMPLETED');
  const totalProviderShare = paidLaborJobs.reduce((sum, j) => sum + getAdminNetPaidLaborProviderShare(j), 0);
  const totalReleasedToProviders = paidLaborJobs.reduce(
    (sum, j) => sum + getAdminNetPaidLaborReleasedAmount(j),
    0
  );

  const getPaymentStatus = (job: Job) => getAdminPaymentStatusDisplay(job);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Jobs Payments</h1>
          <p className="text-muted-foreground">Monitor escrow and payment transactions (ZAR)</p>
        </div>

        {(customerObligations.length > 0 || providerRefundDebts.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Customer payment obligations</h2>
              </div>
              <div className="max-h-56 overflow-auto text-sm">
                {customerObligations.slice(0, 20).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2 text-left hover:bg-muted/40"
                    onClick={() => navigate(`/admin/customers/${row.customerId}`)}
                  >
                    <span className="min-w-0 truncate">
                      {row.customerName || row.customerEmail || row.customerId}
                      {row.marketplaceRestricted ? ' · restricted' : ''}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrency(row.amountDue)} · {row.displayStatus || row.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="card-elevated overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Provider refund debt</h2>
              </div>
              <div className="max-h-56 overflow-auto text-sm">
                {providerRefundDebts.slice(0, 20).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2 text-left hover:bg-muted/40"
                    onClick={() =>
                      row.providerUserId
                        ? navigate(`/admin/providers/${row.providerUserId}`)
                        : navigate('/admin/refund-repayments')
                    }
                  >
                    <span className="min-w-0 truncate">
                      {row.providerName || row.providerEmail || row.providerId}
                      {row.restrictionActive ? ' · restricted' : ''}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrency(row.amountDue)} · {row.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1 sm:min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by ID, name, category, city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={ADMIN_FILTER_SELECT_CLASS}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className={ADMIN_FILTER_SELECT_CLASS}
                aria-label="Filter by city"
              >
                <option value="all">All Cities</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AdminPaymentStatusFilter)}
                className={ADMIN_FILTER_SELECT_CLASS}
                aria-label="Filter by payment status"
              >
                <option value="all">All Status</option>
                <option value="released">Released</option>
                <option value="held">Held</option>
                <option value="refund">Refund</option>
              </select>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
                >
                  {f.label}
                  <button type="button" onClick={() => clearFilter(f.key)} className="hover:text-primary/70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setCityFilter('all');
                  setStatusFilter('all');
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Stats (scoped to current filters) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {completedPaidJobs.length} / {paidLaborJobs.length}
                </p>
                <p className="text-sm text-muted-foreground">Completed jobs</p>
                <p className="text-xs text-muted-foreground mt-0.5">Completed & paid / All paid jobs</p>
              </div>
            </div>
          </div>
          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalProviderShare)}</p>
                <p className="text-sm font-medium text-foreground">Total provider share</p>
                <p className="text-xs text-muted-foreground mt-0.5">Labor & delivery (93%, all paid)</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalReleasedToProviders)}</p>
                <p className="text-sm text-muted-foreground">Released to providers</p>
                <p className="text-xs text-muted-foreground mt-0.5">Released by admin (excludes held)</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-bold tabular-nums leading-snug">
                  {formatAdminCommissionBreakdown(
                    commissionBreakdown.labor,
                    commissionBreakdown.material,
                    commissionBreakdown.total
                  )}
                </p>
                <p className="text-sm text-muted-foreground">Total commission earned</p>
                <p className="text-xs text-muted-foreground mt-0.5">Labor + material (7%, all paid)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="card-elevated overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="font-semibold">Recent Transactions</h3>
            <p className="text-xs text-muted-foreground mt-1">Amounts from job records after labor settlement.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-4 py-3 text-left">Job</th>
                  <th className="table-header px-4 py-3 text-left">Customer</th>
                  <th className="table-header px-4 py-3 text-left">Provider</th>
                  <th className="table-header px-4 py-3 text-right">Total price</th>
                  <th className="table-header px-4 py-3 text-right">Commission (7%)</th>
                  <th className="table-header px-4 py-3 text-right">Provider (93%)</th>
                  <th className="table-header px-4 py-3 text-right">Released</th>
                  <th className="table-header px-4 py-3 text-right">Remaining</th>
                  <th className="table-header px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="px-4 py-4">
                        <div className="animate-pulse h-4 bg-muted rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => {
                    const paymentStatus = getPaymentStatus(job);
                    const f = rowFinancials(job);
                    return (
                      <tr
                        key={job.id}
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/payments/${job.id}`)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{job.categoryName}</p>
                          <p className="text-xs text-muted-foreground">#{job.id.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-[140px] truncate">{job.userName}</td>
                        <td className="px-4 py-3 text-sm max-w-[140px] truncate">{job.providerName || '—'}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">
                          {formatCurrency(f.totalPrice)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(f.commission)}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(f.provider)}</td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums text-primary">
                          {formatCurrency(f.released)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatCurrency(f.remaining)}</td>
                        <td className={cn('px-4 py-3 text-sm font-medium', paymentStatus.class)}>
                          {paymentStatus.label}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <p className="text-muted-foreground">
                        {activeFilters.length > 0 || searchQuery || statusFilter !== 'all'
                          ? 'No transactions match your filters'
                          : 'No transactions yet'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-border text-sm text-muted-foreground">
            {filteredJobs.length} of {jobs.length} jobs
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
