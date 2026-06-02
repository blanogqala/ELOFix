import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getJobs } from '@/lib/api/jobs';
import { getCategories } from '@/lib/api/categories';
import { Category, Job } from '@/types';
import { Search, Briefcase, ArrowRight, X, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import { getJobDisplayStatusLabel, getUserJobBadgeClassForJob } from '@/lib/jobProgressDisplay';
import {
  jobMatchesAdminStatusFilter,
  ADMIN_JOB_STATUS_FILTER_LABELS,
} from '@/lib/jobStatusMapping';
import {
  ADMIN_FILTER_SELECT_CLASS,
  collectJobCities,
  jobMatchesAdminSearch,
  jobMatchesCategoryFilter,
  jobMatchesCityFilter,
} from '@/lib/adminJobFilters';

type SortKey = 'newest' | 'oldest' | 'status' | 'category';

export default function AdminJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  const cities = useMemo(() => collectJobCities(jobs), [jobs]);

  useEffect(() => {
    void loadJobs();
    void loadCategories();
  }, []);

  const loadJobs = async () => {
    try { setJobs(await getJobs()); }
    catch (e) { console.error('Failed to load jobs:', e); }
    finally { setIsLoading(false); }
  };

  const loadCategories = async () => {
    try {
      setCategories(await getCategories());
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    }
  };

  const activeFilters = [
    statusFilter !== 'all' && {
      key: 'status',
      label: ADMIN_JOB_STATUS_FILTER_LABELS[statusFilter] ?? statusFilter,
    },
    categoryFilter !== 'all' && { key: 'category', label: categories.find(c => c.id === categoryFilter)?.name || categoryFilter },
    cityFilter !== 'all' && { key: 'city', label: cityFilter },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearFilter = (key: string) => {
    if (key === 'status') setStatusFilter('all');
    if (key === 'category') setCategoryFilter('all');
    if (key === 'city') setCityFilter('all');
  };

  const filteredJobs = useMemo(() => {
    const result = jobs.filter(job => {
      const matchesSearch = jobMatchesAdminSearch(job, searchQuery);
      const matchesStatus = jobMatchesAdminStatusFilter(job.status, statusFilter);
      const matchesCategory = jobMatchesCategoryFilter(job, categoryFilter);
      const matchesCity = jobMatchesCityFilter(job, cityFilter);
      return matchesSearch && matchesStatus && matchesCategory && matchesCity;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'status': return a.status.localeCompare(b.status);
        case 'category': return a.categoryName.localeCompare(b.categoryName);
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [jobs, searchQuery, statusFilter, categoryFilter, cityFilter, sortBy]);

  const stats = useMemo(
    () => ({
      totalJobs: filteredJobs.length,
      completedJobs: filteredJobs.filter((j) => j.status === 'COMPLETED').length,
      cancelledJobs: filteredJobs.filter((j) => j.status === 'CANCELLED').length,
      pendingJobs: filteredJobs.filter((j) => j.status === 'PENDING').length,
    }),
    [filteredJobs],
  );

  const getStatusBadge = (job: Job) => (
    <span className={cn('status-badge', getUserJobBadgeClassForJob(job))}>
      {getJobDisplayStatusLabel(job)}
    </span>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">All Jobs</h1>
          <p className="text-muted-foreground">Monitor and manage platform jobs</p>
        </div>

        {/* Jobs overview stats (scoped to current filters) */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card-elevated p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-12 sm:w-12">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{stats.totalJobs}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Total Jobs</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10 sm:h-12 sm:w-12">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{stats.completedJobs}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Completed Jobs</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 sm:h-12 sm:w-12">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{stats.pendingJobs}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Pending Jobs</p>
              </div>
            </div>
          </div>

          <div className="card-elevated p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 sm:h-12 sm:w-12">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xl font-bold sm:text-2xl">{stats.cancelledJobs}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">Cancelled Jobs</p>
              </div>
            </div>
          </div>
        </div>

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
                onChange={(e) => setStatusFilter(e.target.value)}
                className={ADMIN_FILTER_SELECT_CLASS}
                aria-label="Filter by status"
              >
                {Object.entries(ADMIN_JOB_STATUS_FILTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className={ADMIN_FILTER_SELECT_CLASS}
                aria-label="Sort jobs"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="status">By Status</option>
                <option value="category">By Category</option>
              </select>
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map(f => (
                <span key={f.key} className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  {f.label}
                  <button onClick={() => clearFilter(f.key)} className="hover:text-primary/70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setCategoryFilter('all');
                  setCityFilter('all');
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Jobs Table */}
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead>
                <tr className="border-b-2 border-primary">
                  <th className="table-header px-6 py-4 text-left">Job</th>
                  <th className="table-header px-6 py-4 text-left">Category</th>
                  <th className="table-header px-6 py-4 text-left">Customer</th>
                  <th className="table-header px-6 py-4 text-left">Provider</th>
                  <th className="table-header px-6 py-4 text-left">Status</th>
                  <th className="table-header px-6 py-4 text-left">Total</th>
                  <th className="table-header px-6 py-4 text-left">Date</th>
                  <th className="table-header px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-6 py-4">
                        <div className="animate-pulse h-4 bg-muted rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => {
                    const cat = categories.find(c => c.id === job.category);
                    return (
                      <tr 
                        key={job.id} 
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/jobs/${job.id}`)}
                      >
                        <td className="px-6 py-4">
                          <p className="text-xs text-muted-foreground font-mono">#{job.id.slice(-8)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{cat?.icon}</span>
                            <span className="text-sm font-medium">{job.categoryName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">{job.userName}</td>
                        <td className="px-6 py-4 text-sm">{job.providerName || '—'}</td>
                        <td className="px-6 py-4">{getStatusBadge(job)}</td>
                        <td className="px-6 py-4 text-sm font-medium">{formatCurrency(job.totalEstimateRange.min)}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <Briefcase className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium">No jobs found</p>
                      <p className="text-sm text-muted-foreground">
                        {activeFilters.length > 0 || searchQuery
                          ? 'Try adjusting your filters'
                          : 'No jobs have been created yet'}
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
