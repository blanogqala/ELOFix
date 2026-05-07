import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getAdminSuppliers, provisionAdminSupplier } from '@/lib/api/admin';
import { Search, Plus, Eye, Store, TrendingUp, Percent, PackageCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatCurrency';

export default function AdminSuppliers() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    businessName: '',
    phone: '',
    address: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: () => getAdminSuppliers(),
  });

  const suppliers = data?.suppliers ?? [];
  const ga = data?.globalSupplierOrderAnalytics;

  const provisionMut = useMutation({
    mutationFn: () =>
      provisionAdminSupplier({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || undefined,
        businessName: form.businessName.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Supplier created' });
      setAddOpen(false);
      setForm({ email: '', password: '', name: '', businessName: '', phone: '', address: '' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filtered = suppliers.filter(
    (s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.businessName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.linkedUserEmail || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Suppliers</h1>
            <p className="text-muted-foreground max-w-2xl">
              Platform-wide supplier performance from completed, paid material orders. Commission is{' '}
              {Math.round((ga?.commissionRate ?? 0.07) * 100)}% of each order total.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create supplier
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-2 border-primary shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total suppliers</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{ga?.totalSuppliers ?? suppliers.length}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2">
                  <Store className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supplier revenue</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatCurrency(ga?.totalRevenue ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Completed & paid orders</p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform commission</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-accent">
                    {formatCurrency(ga?.totalCommission ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.round((ga?.commissionRate ?? 0.07) * 100)}% of order totals
                  </p>
                </div>
                <div className="rounded-lg bg-accent/10 p-2">
                  <Percent className="h-5 w-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-primary shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Orders fulfilled</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{ga?.orderCount ?? 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Completed & paid</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2">
                  <PackageCheck className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-primary bg-background p-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Search by store, business, or email…"
            className="h-10 border-0 flex-1 min-w-[12rem]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}

        <div className="rounded-lg border-2 border-primary overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.businessName || s.name}</div>
                    {s.businessName && s.businessName !== s.name && (
                      <div className="text-xs text-muted-foreground">{s.name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.linkedUserEmail ? (
                      <span className="text-sm">{s.linkedUserEmail}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.linkedUserEmail ? (
                      <Badge variant="outline" className="font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">No login</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    No suppliers match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create supplier account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Business name *</Label>
              <Input
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                placeholder="Acme Plumbing Supply"
              />
            </div>
            <div>
              <Label>Contact / display name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Login email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label>Temporary password *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters. Share securely with the vendor.</p>
            </div>
            <div>
              <Label>Business phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <Button
              type="button"
              className="btn-accent w-full mt-2"
              disabled={provisionMut.isPending}
              onClick={() => {
                if (!form.email.trim() || !form.password || form.password.length < 8 || !form.businessName.trim()) {
                  toast({
                    title: 'Missing fields',
                    description: 'Email, password (8+ chars), and business name are required.',
                    variant: 'destructive',
                  });
                  return;
                }
                provisionMut.mutate();
              }}
            >
              Create supplier
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
