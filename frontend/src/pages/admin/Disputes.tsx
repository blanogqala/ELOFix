import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listAdminDisputes, type AdminDisputeRow } from '@/lib/api/adminDisputes';
import { formatRequestedResolution } from '@/lib/disputeLabels';
import { JobCardSkeleton } from '@/components/common/loading';
import { Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminDisputes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('open');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = tab === 'open' ? 'OPEN' : tab === 'resolved' ? 'RESOLVED' : 'all';
      const data = await listAdminDisputes({ search: search || undefined, status });
      setRows(data.disputes);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load disputes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [search, tab, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold">Disputes</h1>
          <p className="text-muted-foreground">Investigate and resolve customer–provider disputes</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search disputes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <JobCardSkeleton count={6} className="py-4" />
            ) : rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No disputes found</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => navigate(`/admin/disputes/${row.id}`)}
                    className="card-elevated w-full p-4 text-left hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{row.jobTitle || `Job ${row.jobId.slice(-8)}`}</p>
                        <p className="text-sm text-muted-foreground">
                          {row.customerName} vs {row.providerName}
                        </p>
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted">{row.status}</span>
                    </div>
                    <p className="text-sm mt-2 line-clamp-2">{row.customerComment}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatRequestedResolution(row.requestedResolution, row.otherResolutionDetail)} · {new Date(row.openedAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
