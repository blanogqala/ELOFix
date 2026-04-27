import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getAdminProviders, approveProvider } from '@/lib/api/providers';
import { getCategories } from '@/lib/api/categories';
import { Category, Provider } from '@/types';
import { 
  Search, Check, X, Star, Briefcase, FileCheck, Clock, User, MapPin
} from 'lucide-react';

export default function AdminProviders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'blocked'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [approvingProviderId, setApprovingProviderId] = useState<string | null>(null);

  useEffect(() => {
    void loadProviders();
    void loadCategories();
  }, []);

  const loadProviders = async () => {
    try {
      setProvidersError(null);
      setProviders(await getAdminProviders());
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load providers';
      setProvidersError(message);
      setProviders([]);
    }
    finally { setIsLoading(false); }
  };

  const loadCategories = async () => {
    try {
      setCategories(await getCategories());
    } catch {
      setCategories([]);
    }
  };

  const handleApprove = async (providerId: string) => {
    if (approvingProviderId === providerId) return;
    try {
      setApprovingProviderId(providerId);
      await approveProvider(providerId);
      toast({ title: 'Provider approved', description: 'The provider can now receive job requests.' });
      await loadProviders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve provider.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setApprovingProviderId(null);
    }
  };

  const cities = useMemo(() => {
    const set = new Set<string>();
    providers.forEach(p => { if (p.city) set.add(p.city); });
    return Array.from(set).sort();
  }, [providers]);

  const filteredProviders = useMemo(() => {
    return providers
      .filter(p => !p.deletedAt)
      .filter(provider => {
      const matchesSearch = !searchQuery ||
        provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (provider.city || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'pending' && !provider.approved && !provider.blocked) ||
        (statusFilter === 'approved' && provider.approved && !provider.blocked) ||
        (statusFilter === 'blocked' && provider.blocked);
      const matchesCity = cityFilter === 'all' || provider.city === cityFilter;
      return matchesSearch && matchesStatus && matchesCity;
    });
  }, [providers, searchQuery, statusFilter, cityFilter]);

  const activeFilters = [
    statusFilter !== 'all' && { key: 'status', label: statusFilter },
    cityFilter !== 'all' && { key: 'city', label: cityFilter },
  ].filter(Boolean) as { key: string; label: string }[];

  const clearFilter = (key: string) => {
    if (key === 'status') setStatusFilter('all');
    if (key === 'city') setCityFilter('all');
  };

  const getDocumentStatus = (provider: Provider) => {
    const docs = provider.documents;
    const totalDocs = Object.keys(docs).length;
    const approvedDocs = Object.values(docs).filter(d => d?.status === 'approved').length;
    return { total: totalDocs, approved: approvedDocs };
  };

  const getResolvedServiceNames = (skills: string[]) =>
    skills
      .map((skill) => categories.find((c) => c.id === skill)?.name || skill)
      .filter(Boolean);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Provider Management</h1>
            <p className="text-muted-foreground">Review and approve service providers</p>
          </div>
        </div>

        {providersError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {providersError.toLowerCase().includes('not implemented')
              ? 'Admin data not yet connected'
              : providersError}
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="input-field h-10 w-40 px-3 text-sm">
              <option value="all">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              {(['all', 'pending', 'approved'] as const).map((f) => (
                <Button
                  key={f}
                  variant={statusFilter === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
                
              ))}
            </div>
          </div>

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
              <button onClick={() => { setStatusFilter('all'); setCityFilter('all'); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Providers Table */}
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-6 py-4 text-left">Provider</th>
                  <th className="table-header px-6 py-4 text-left">City</th>
                  <th className="table-header px-6 py-4 text-left">Services</th>
                  <th className="table-header px-6 py-4 text-left">Status</th>
                  <th className="table-header px-6 py-4 text-left">Docs</th>
                  <th className="table-header px-6 py-4 text-left">Rating</th>
                  <th className="table-header px-6 py-4 text-left">Registered</th>
                  <th className="table-header px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={8} className="px-6 py-4"><div className="animate-pulse h-4 bg-muted rounded w-full" /></td></tr>
                  ))
                ) : filteredProviders.length > 0 ? (
                  filteredProviders.map((provider) => {
                    const docStatus = getDocumentStatus(provider);
                    const activeServiceNames = getResolvedServiceNames(provider.skills || []);
                    const pendingServiceNames = (provider.pendingSuggestions || []).map((s) => s.name);
                    const allServices = [
                      ...activeServiceNames.map((name) => ({ name, pending: false })),
                      ...pendingServiceNames.map((name) => ({ name, pending: true })),
                    ];
                    return (
                      <tr key={provider.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-primary">{provider.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{provider.name}</p>
                              <p className="text-xs text-muted-foreground">{provider.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-sm">
                            {provider.city || '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-1 text-xs">
                            {allServices.map((service, idx) => (
                              <span
                                key={`${provider.id}-${service.name}-${idx}`}
                                className={service.pending ? 'text-orange-700 dark:text-orange-300' : 'text-foreground'}
                              >
                                {service.name}
                                {service.pending ? ' (Pending)' : ''}
                                {idx < allServices.length - 1 ? ',' : ''}
                              </span>
                            ))}
                            {allServices.length === 0 && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {provider.blocked ? (
                            <span className="status-badge status-cancelled">Blocked</span>
                          ) : provider.approved ? (
                            <span className="status-badge status-completed">Approved</span>
                          ) : (
                            <span className="status-badge status-assigned">Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1 text-sm">
                            <FileCheck className="h-2.5 w-2.5 text-muted-foreground" />
                            {docStatus.approved}/{docStatus.total}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1 text-sm">
                            <Star className="h-2.5 w-2.5 fill-accent text-accent" />
                            {provider.rating > 0 ? provider.rating.toFixed(1) : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(provider.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/providers/${provider.id}`); }}>
                              View
                            </Button>
                            {!provider.approved && !provider.blocked && (
                              <Button
                                size="sm"
                                disabled={approvingProviderId === provider.id}
                                onClick={(e) => { e.stopPropagation(); void handleApprove(provider.id); }}
                              >
                                <Check className="mr-1 h-2 w-2" />
                                {approvingProviderId === provider.id ? 'Approving...' : 'Approve'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="font-medium">No providers found</p>
                      <p className="text-sm text-muted-foreground">
                        {activeFilters.length > 0 || searchQuery ? 'Try adjusting your filters' : 'No providers have registered yet'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-border text-sm text-muted-foreground">
            {filteredProviders.length} of {providers.length} providers
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
