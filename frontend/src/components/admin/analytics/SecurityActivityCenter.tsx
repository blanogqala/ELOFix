import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  type AuditSeverity,
} from '@/lib/api/adminAudit';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  Shield,
  User,
} from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

function formatAction(action: string): string {
  return action.replace(/\./g, ' · ');
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatAbsoluteTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function summarizeChange(row: AdminAuditLogRow): string {
  if (row.oldValue && row.newValue) return 'State changed';
  if (row.newValue && typeof row.newValue === 'object') {
    const keys = Object.keys(row.newValue).slice(0, 3);
    if (keys.length === 0) return '—';
    return keys.map((k) => `${k}: ${String((row.newValue as Record<string, unknown>)[k])}`).join(', ');
  }
  return '—';
}

function severityStyles(severity?: AuditSeverity) {
  switch (severity) {
    case 'critical':
      return {
        badge: 'bg-destructive/15 text-destructive border-destructive/30',
        border: 'border-l-destructive',
      };
    case 'warning':
      return {
        badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
        border: 'border-l-amber-500',
      };
    default:
      return {
        badge: 'bg-muted text-muted-foreground border-border',
        border: 'border-l-primary/40',
      };
  }
}

function entityLink(row: AdminAuditLogRow): string | null {
  if (!row.entityId) return null;
  if (row.entityType === 'provider' || (row.entityType === 'user' && row.userRole === 'PROVIDER')) {
    return `/admin/providers/${row.userId || row.entityId}`;
  }
  if (row.entityType === 'job') return `/admin/jobs`;
  if (row.entityType === 'dispute') return `/admin/jobs`;
  return null;
}

function SecurityEventCard({
  row,
  expanded,
  onToggle,
  index,
}: {
  row: AdminAuditLogRow;
  expanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const styles = severityStyles(row.severity);
  const link = entityLink(row);

  return (
    <div
      className={cn(
        'card-elevated border-l-4 overflow-hidden animate-fade-in transition-shadow hover:shadow-md',
        styles.border
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <button
        type="button"
        className="w-full text-left p-4 sm:p-5 space-y-3"
        onClick={onToggle}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wide', styles.badge)}>
                {row.severity ?? 'info'}
              </Badge>
              <span className="text-xs text-muted-foreground" title={formatAbsoluteTime(row.createdAt)}>
                {formatRelativeTime(row.createdAt)}
              </span>
            </div>
            <p className="font-semibold text-sm sm:text-base">{formatAction(row.action)}</p>
            <p className="text-xs text-muted-foreground truncate">{summarizeChange(row)}</p>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="flex gap-2 items-start">
            <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{row.userName || row.userEmail || row.userId || 'System'}</p>
              <p className="text-muted-foreground">
                {row.userRole && <span>{row.userRole} · </span>}
                <span>{row.actorType}</span>
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground mb-0.5">Entity</p>
            <p className="font-medium">{row.entityType || '—'}</p>
            {row.entityId && (
              link ? (
                <Link
                  to={link}
                  className="text-primary hover:underline font-mono text-[11px] truncate block"
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.entityId.slice(0, 8)}…
                </Link>
              ) : (
                <p className="font-mono text-[11px] text-muted-foreground truncate">{row.entityId}</p>
              )
            )}
          </div>
          <div className="flex gap-2 items-start">
            <Globe className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-mono truncate">{row.ipAddress || '—'}</p>
              {row.deviceFingerprint && (
                <p className="text-muted-foreground truncate" title={row.deviceFingerprint}>
                  FP: {row.deviceFingerprint.slice(0, 12)}…
                </p>
              )}
              {row.device?.os && (
                <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Monitor className="h-3 w-3" />
                  {row.device.os}
                  {row.device.city ? ` · ${row.device.city}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 sm:px-5 py-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="font-sans font-medium text-sm mb-1">Old value</p>
              <pre className="whitespace-pre-wrap break-all text-muted-foreground max-h-48 overflow-auto">
                {JSON.stringify(row.oldValue ?? row.metadata, null, 2) || '—'}
              </pre>
            </div>
            <div>
              <p className="font-sans font-medium text-sm mb-1">New value</p>
              <pre className="whitespace-pre-wrap break-all text-muted-foreground max-h-48 overflow-auto">
                {JSON.stringify(row.newValue, null, 2) || '—'}
              </pre>
            </div>
          </div>
          {row.device?.userAgent && (
            <p className="text-[11px] text-muted-foreground break-all">
              User-Agent: {row.device.userAgent}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function SecurityActivityCenter() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [actionCategory, setActionCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [actorType, setActorType] = useState('all');
  const [actorRole, setActorRole] = useState('all');
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
  }, [search, entityType, actionCategory, severity, actorType, actorRole, from, to]);

  const queryParams = useMemo(
    () => ({
      search: search || undefined,
      entityType: entityType !== 'all' ? entityType : undefined,
      actionCategory: actionCategory !== 'all' ? actionCategory : undefined,
      severity: severity !== 'all' ? severity : undefined,
      actorType: actorType !== 'all' ? actorType : undefined,
      actorRole: actorRole !== 'all' ? actorRole : undefined,
      from: from || undefined,
      to: to || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [search, entityType, actionCategory, severity, actorType, actorRole, from, to, offset]
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
        severity: severity !== 'all' ? severity : undefined,
        actorType: actorType !== 'all' ? actorType : undefined,
        actorRole: actorRole !== 'all' ? actorRole : undefined,
        from: from || undefined,
        to: to || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `security-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export complete', description: 'Security activity CSV downloaded.' });
    } catch (e) {
      toast({
        title: 'Export failed',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [search, entityType, actionCategory, severity, actorType, actorRole, from, to, toast]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Security & Activity Center</h2>
          <p className="text-sm text-muted-foreground">
            Enterprise audit trail with severity classification and device context.
          </p>
        </div>
      </div>

      <div className="card-elevated p-4 space-y-3">
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
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-[140px]">
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
            <SelectTrigger className="w-[160px]">
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
              <SelectItem value="notifications">Notifications</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actorType} onValueChange={setActorType}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Actor type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="USER">User</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="SYSTEM">System</SelectItem>
              <SelectItem value="BRANCH_STAFF">Branch staff</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actorRole} onValueChange={setActorRole}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Actor role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="CUSTOMER">Customer</SelectItem>
              <SelectItem value="PROVIDER">Provider</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="SUPPLIER">Supplier</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void runExport()} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Export</span>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{total} events</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading security events…
        </div>
      ) : items.length === 0 ? (
        <div className="card-elevated py-16 text-center text-muted-foreground">
          No events match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row, i) => (
            <SecurityEventCard
              key={row.id}
              row={row}
              index={i}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
            />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between card-elevated px-4 py-3">
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
  );
}
