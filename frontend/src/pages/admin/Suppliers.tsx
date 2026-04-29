import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getAdminSupplierMaterialOrders, getAdminSuppliers } from '@/lib/api/admin';
import { provisionSupplier } from '@/lib/api/suppliers';
import type { Supplier } from '@/types';
import { Search, Package, Plus, Eye } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/lib/formatCurrency';

export default function AdminSuppliers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    businessName: '',
    phone: '',
    address: '',
  });

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: () => getAdminSuppliers(),
  });

  const ordersQuery = useQuery({
    queryKey: ['admin', 'supplier', 'orders', detail?.id],
    queryFn: () => getAdminSupplierMaterialOrders(detail!.id),
    enabled: Boolean(detail?.id),
  });

  const provisionMut = useMutation({
    mutationFn: () =>
      provisionSupplier({
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
      (s.businessName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Suppliers</h1>
            <p className="text-muted-foreground">
              Provision vendor logins (not public signup). Inventory is managed only in the supplier portal.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create supplier
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Search…"
            className="h-10 border-0 flex-1 min-w-[12rem]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}

        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.businessName && <div className="text-xs text-muted-foreground">{s.businessName}</div>}
                  </TableCell>
                  <TableCell>
                    {s.linkedUserEmail ? (
                      <span className="text-sm">{s.linkedUserEmail}</span>
                    ) : (
                      <Badge variant="secondary">No login</Badge>
                    )}
                  </TableCell>
                  <TableCell>{s.products?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => setDetail(s)}>
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

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> {detail?.name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Account</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Login:</span>{' '}
                      {detail.linkedUserEmail || 'No linked login'}
                    </p>
                    {detail.linkedUserId && (
                      <p>
                        <span className="text-muted-foreground">User id:</span> {detail.linkedUserId}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Catalog (read-only)</h3>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {(detail.products || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No SKUs listed.</p>
                    )}
                    {(detail.products || []).map((p) => (
                      <Card key={p.id} className="overflow-hidden">
                        <CardHeader className="py-2">
                          <CardTitle className="text-sm leading-tight">{p.name}</CardTitle>
                          <p className="text-xs text-muted-foreground capitalize">{p.category}</p>
                          <p className="text-sm font-semibold">{formatCurrency(p.price)}</p>
                          <Badge variant={p.inStock ? 'default' : 'secondary'}>
                            {p.inStock ? 'In stock' : 'Out'}
                          </Badge>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Orders & commission</h3>
                  {ordersQuery.isLoading && <p className="text-sm text-muted-foreground">Loading orders…</p>}
                  {!ordersQuery.isLoading && (ordersQuery.data?.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground">No material orders for this vendor yet.</p>
                  )}
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Materials</TableHead>
                          <TableHead className="text-right">Platform 7%</TableHead>
                          <TableHead className="text-right">Supplier 93%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(ordersQuery.data || []).map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}…</TableCell>
                            <TableCell>
                              <div className="text-sm">{o.customerName}</div>
                              <div className="text-xs text-muted-foreground">{o.customerEmail}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{String(o.fulfillmentStatus || '—')}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(Number(o.materialsSubtotal ?? 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(Number(o.platformCommission ?? 0))}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(Number(o.supplierEarning ?? 0))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
