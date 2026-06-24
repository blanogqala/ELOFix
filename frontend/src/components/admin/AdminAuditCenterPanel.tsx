import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  exportAdminAuditLogsCsv,
  listAdminAuditLogs,
  type AdminAuditLogRow,
} from '@/lib/api/adminAudit';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

function formatAction(action: string): string {
  return action.replace(/\./g, ' · ');
}

function summarizeChange(row: AdminAuditLogRow): string {
  if (row.oldValue && row.newValue) {
    return 'State changed';
  }
  if (row.newValue && typeof row.newValue === 'object') {
    const keys = Object.keys(row.newValue).slice(0, 3);
    if (keys.length === 0) return '—';
    return keys.map((k) => `${k}: ${String((row.newValue as Record<string, unknown>)[k])}`).join(', ');
  }
  return '—';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminAuditCenterPanel() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [actionCategory, setActionCategory] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setOffset(0);
  }, [search, entityType, actionCategory, from, to]);

  const queryParams = useMemo(
    () => ({
      search: search || undefined,
      entityType: entityType !== 'all' ? entityType : undefined,
      actionCategory: actionCategory !== 'all' ? actionCategory : undefined,
      from: from || undefined,
      to: to || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [search, entityType, actionCategory, from, to, offset]
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'audit-logs', queryParams],
    queryFn: () => listAdminAuditLogs(queryParams),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const runExport = useCallback(async () => {
    setExporting(true);
    try {
      const blob = await exportAdminAuditLogsCsv({
        search: search || undefined,
        entityType: entityType !== 'all' ? entityType : undefined,
        actionCategory: actionCategory !== 'all' ? actionCategory : undefined,
        from: from || undefined,
        to: to || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export started', description: 'Audit log CSV downloaded.' });
    } catch (e) {
      toast({
        title: 'Export failed',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [search, entityType, actionCategory, from, to, toast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search action, user, entity ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="provider">Provider</SelectItem>
            <SelectItem value="job">Job</SelectItem>
            <SelectItem value="dispute">Dispute</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionCategory} onValueChange={setActionCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="authentication">Authentication</SelectItem>
            <SelectItem value="verification">Verification</SelectItem>
            <SelectItem value="payments">Payments</SelectItem>
            <SelectItem value="disputes">Disputes</SelectItem>
            <SelectItem value="fraud">Fraud</SelectItem>
            <SelectItem value="trust_score">Trust score</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void runExport()} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-2">Export CSV</span>
        </Button>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-6 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Audit log</h3>
            <p className="text-sm text-muted-foreground">{total} events</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header px-6 py-4 text-left">Time</th>
                <th className="table-header px-6 py-4 text-left">Action</th>
                <th className="table-header px-6 py-4 text-left">Actor</th>
                <th className="table-header px-6 py-4 text-left">Entity</th>
                <th className="table-header px-6 py-4 text-left">Summary</th>
                <th className="table-header px-6 py-4 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    Loading audit events…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    No audit events match your filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="border-b border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="px-6 py-3 text-sm whitespace-nowrap">{formatTime(row.createdAt)}</td>
                      <td className="px-6 py-3 text-sm font-medium">{formatAction(row.action)}</td>
                      <td className="px-6 py-3 text-sm">
                        <div>{row.userName || row.userEmail || row.userId || '—'}</div>
                        <div className="text-xs text-muted-foreground">{row.actorType}</div>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <div>{row.entityType || '—'}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                          {row.entityId || ''}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                        {summarizeChange(row)}
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">{row.ipAddress || '—'}</td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
                            <div>
                              <p className="font-sans font-medium text-sm mb-1">Old value</p>
                              <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                                {JSON.stringify(row.oldValue ?? row.metadata, null, 2) || '—'}
                              </pre>
                            </div>
                            <div>
                              <p className="font-sans font-medium text-sm mb-1">New value</p>
                              <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                                {JSON.stringify(row.newValue, null, 2) || '—'}
                              </pre>
                            </div>
                          </div>
                          {row.deviceFingerprint && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Device: {row.deviceFingerprint}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
