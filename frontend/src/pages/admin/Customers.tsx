import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAdminCustomers } from '@/lib/api/adminCustomers';
import { Search, X, User, Users, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveUploadUrl } from '@/lib/uploadUrl';

type StatusFilter = 'all' | 'has_active' | 'has_completed' | 'no_jobs';

export default function AdminCustomers() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: () => getAdminCustomers(),
  });

  const customers = data?.customers ?? [];
  // Summary is useful server-side for initial render, but card totals must reflect active filters.

  const cities = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.city) set.add(c.city);
    });
    return Array.from(set).sort();
  }, [customers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q);
      const matchesCity = cityFilter === 'all' || c.city === cityFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'has_active' && c.jobCounts.active > 0) ||
        (statusFilter === 'has_completed' && c.jobCounts.completed > 0) ||
        (statusFilter === 'no_jobs' && c.jobCounts.total === 0);
      return matchesSearch && matchesCity && matchesStatus;
    });
  }, [customers, searchQuery, cityFilter, statusFilter]);

  const filteredRevenue = useMemo(() => {
    return filtered.reduce((sum, c) => sum + (c.totalPaid ?? 0), 0);
  }, [filtered]);

  const activeFilters = [
    statusFilter !== 'all' && {
      key: 'status',
      label:
        statusFilter === 'has_active'
          ? 'Active jobs'
          : statusFilter === 'has_completed'
            ? 'Has completed'
            : 'No jobs',
    },
    cityFilter !== 'all' && { key: 'city', label: cityFilter },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearFilter = (key: string) => {
    if (key === 'status') setStatusFilter('all');
    if (key === 'city') setCityFilter('all');
  };

  const listError =
    isError && !data?.customers?.length && error instanceof Error ? error.message : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Customer Management</h1>
          <p className="text-muted-foreground">
            Registered customers, job activity, and paid revenue
          </p>
        </div>

        {listError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {listError.toLowerCase().includes('not implemented')
              ? 'Admin data not yet connected'
              : listError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <Card className="border-2 border-primary shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Registered customers
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {filtered.length}
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-accent shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total customer revenue
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatCurrency(filteredRevenue)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Paid labor and materials (all time)</p>
                </div>
                <div className="rounded-lg bg-accent/10 p-2">
                  <DollarSign className="h-5 w-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="input-field h-10 w-full px-3 text-sm sm:w-40"
            >
              <option value="all">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'All'],
                  ['has_active', 'Active jobs'],
                  ['has_completed', 'Completed'],
                  ['no_jobs', 'No jobs'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  variant={statusFilter === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {f.label}
                  <button
                    type="button"
                    onClick={() => clearFilter(f.key)}
                    className="hover:text-primary/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setCityFilter('all');
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-6 py-4 text-left">Customer</th>
                  <th className="table-header px-6 py-4 text-left">City</th>
                  <th className="table-header px-6 py-4 text-left">Services</th>
                  <th className="table-header px-6 py-4 text-left">Completed</th>
                  <th className="table-header px-6 py-4 text-left">Active</th>
                  <th className="table-header px-6 py-4 text-left">Disputed</th>
                  <th className="table-header px-6 py-4 text-left">Rejected</th>
                  <th className="table-header px-6 py-4 text-left">Revenue</th>
                  <th className="table-header px-6 py-4 text-left">Registered</th>
                  <th className="table-header px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="px-6 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map((customer) => {
                    const avatarSrc = resolveUploadUrl(customer.profileImage);
                    return (
                      <tr
                        key={customer.id}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => navigate(`/admin/customers/${customer.id}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                              {avatarSrc ? (
                                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-sm font-bold text-primary">
                                  {customer.name.charAt(0)}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{customer.name}</p>
                              <p className="text-xs text-muted-foreground">{customer.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">{customer.city || '—'}</td>
                        <td className="px-6 py-4">
                          <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                            {customer.servicesRequested.length > 0
                              ? customer.servicesRequested.join(', ')
                              : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm tabular-nums">{customer.jobCounts.completed}</td>
                        <td className="px-6 py-4 text-sm tabular-nums">{customer.jobCounts.active}</td>
                        <td className="px-6 py-4 text-sm tabular-nums">{customer.jobCounts.disputed}</td>
                        <td className="px-6 py-4 text-sm tabular-nums">{customer.jobCounts.rejected}</td>
                        <td className="px-6 py-4 text-sm font-medium">
                          {formatCurrency(customer.totalPaid)}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(customer.registeredAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/customers/${customer.id}`);
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium">No customers found</p>
                      <p className="text-sm text-muted-foreground">
                        {activeFilters.length > 0 || searchQuery
                          ? 'Try adjusting your filters'
                          : 'No customers have registered yet'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-6 py-3 text-sm text-muted-foreground">
            {filtered.length} of {customers.length} customers
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
