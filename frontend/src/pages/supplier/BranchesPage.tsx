import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getSupplierBranches, postSupplierBranch, getSupplierAnalyticsOverview } from '@/lib/api/supplierPortal';
import type { SupplierBranchProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { MapPin, ChevronRight, Plus } from 'lucide-react';
import { SupplierSupportFab } from '@/components/supplier/SupplierSupportFab';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function SupplierBranchesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newHasDelivery, setNewHasDelivery] = useState(true);
  const [newDeliveryFee, setNewDeliveryFee] = useState('0');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [branchSearch, setBranchSearch] = useState('');

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['supplier', 'branches', userId],
    queryFn: () => getSupplierBranches(),
    enabled: Boolean(userId),
  });

  const { data: analytics } = useQuery({
    queryKey: ['supplier', 'analytics-overview', userId],
    queryFn: () => getSupplierAnalyticsOverview(),
    enabled: Boolean(userId),
  });

  const distinctCities = useMemo(() => {
    const s = new Set<string>();
    for (const b of branches) {
      const c = (b.city || '').trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [branches]);

  const filteredBranches = useMemo(() => {
    const city = cityFilter.trim().toLowerCase();
    const q = branchSearch.trim().toLowerCase();
    return branches.filter((b) => {
      if (city && (b.city || '').trim().toLowerCase() !== city) return false;
      if (!q) return true;
      const hay = `${b.name} ${b.address || ''} ${b.city || ''} ${b.area || ''} ${b.contactPhone || ''} ${b.contactEmail || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [branches, cityFilter, branchSearch]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'branches', userId] });
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'analytics-overview', userId] });
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewAddress('');
    setNewCity('');
    setNewArea('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewHasDelivery(true);
    setNewDeliveryFee('0');
    setNewLat('');
    setNewLng('');
    setNewActive(true);
  };

  const createMut = useMutation({
    mutationFn: () => {
      const latN = newLat.trim() === '' ? null : Number(newLat);
      const lngN = newLng.trim() === '' ? null : Number(newLng);
      const fee = Number(newDeliveryFee) || 0;
      return postSupplierBranch({
        name: newName.trim(),
        address: newAddress.trim() || undefined,
        city: newCity.trim() || undefined,
        area: newArea.trim() || null,
        contactPhone: newContactPhone.trim() || null,
        contactEmail: newContactEmail.trim() || null,
        hasDelivery: newHasDelivery,
        deliveryFee: newHasDelivery ? fee : 0,
        latitude: latN !== null && !Number.isNaN(latN) ? latN : null,
        longitude: lngN !== null && !Number.isNaN(lngN) ? lngN : null,
        isActive: newActive,
      });
    },
    onSuccess: (branch) => {
      invalidate();
      setCreateOpen(false);
      resetCreateForm();
      toast({ title: 'Branch created' });
      if (branch?.id) {
        navigate(`/supplier/branches/${encodeURIComponent(branch.id)}`);
      }
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-8 animate-fade-in md:max-w-5xl p-4 pb-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">My branches</h1>
            <p className="text-sm text-muted-foreground">Each branch has its own catalog, orders, and location pin.</p>
          </div>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New branch
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total branches</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{analytics?.totalBranches ?? '—'}</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net earnings (all branches)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {analytics != null ? formatCurrency(analytics.sumNetEarningsAllBranches) : '—'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Excludes cancelled orders</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{analytics?.totalOrders ?? '—'}</p>
              <p className="mt-1 text-xs text-muted-foreground">All-time across branches</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex w-full flex-col gap-1.5 sm:w-56">
            <Label className="text-xs text-muted-foreground">City</Label>
            <Select value={cityFilter || '__all__'} onValueChange={(v) => setCityFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All cities</SelectItem>
                {distinctCities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full flex-1 sm:max-w-sm">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input
              className="mt-1.5"
              placeholder="Branch name, address, area…"
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
            />
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add branch</DialogTitle>
              <DialogDescription>Customers pick the nearest branch when ordering materials.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="dlg-b-name">Branch name</Label>
                <Input
                  id="dlg-b-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Bellville"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dlg-b-addr">Address</Label>
                <Input
                  id="dlg-b-addr"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Street, area"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dlg-b-city">City</Label>
                  <Input id="dlg-b-city" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dlg-b-area">Area / suburb</Label>
                  <Input id="dlg-b-area" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dlg-b-phone">Public phone</Label>
                  <Input id="dlg-b-phone" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dlg-b-email">Public email</Label>
                  <Input
                    id="dlg-b-email"
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <div>
                  <Label htmlFor="dlg-delivery">Offers delivery</Label>
                  <p className="text-xs text-muted-foreground">Charge a branch delivery fee when applicable</p>
                </div>
                <Switch id="dlg-delivery" checked={newHasDelivery} onCheckedChange={setNewHasDelivery} />
              </div>
              {newHasDelivery && (
                <div className="space-y-2">
                  <Label htmlFor="dlg-fee">Delivery fee</Label>
                  <Input
                    id="dlg-fee"
                    type="number"
                    min={0}
                    step={0.01}
                    value={newDeliveryFee}
                    onChange={(e) => setNewDeliveryFee(e.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dlg-lat">Latitude (optional)</Label>
                  <Input id="dlg-lat" value={newLat} onChange={(e) => setNewLat(e.target.value)} placeholder="-33.9" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dlg-lng">Longitude (optional)</Label>
                  <Input id="dlg-lng" value={newLng} onChange={(e) => setNewLng(e.target.value)} placeholder="18.4" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newActive} onCheckedChange={setNewActive} id="dlg-active" />
                <Label htmlFor="dlg-active">Active (visible to customers)</Label>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'Saving…' : 'Create branch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredBranches.map((b) => (
              <BranchListCard key={b.id} branch={b} />
            ))}
            {branches.length === 0 && (
              <p className="text-sm text-muted-foreground">No branches yet — create one to accept orders.</p>
            )}
            {branches.length > 0 && filteredBranches.length === 0 && (
              <p className="text-sm text-muted-foreground">No branches match filters.</p>
            )}
          </div>
        )}
      </div>
      <SupplierSupportFab />
    </DashboardLayout>
  );
}

function BranchListCard({ branch }: { branch: SupplierBranchProfile }) {
  const inactive = branch.isActive === false;
  return (
    <Link to={`/supplier/branches/${encodeURIComponent(branch.id)}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="card-elevated transition-colors hover:bg-muted/30">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{branch.displayName || branch.name}</CardTitle>
              <CardDescription className="flex items-start gap-1 mt-1">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-words">
                  {[branch.address, branch.city, branch.area].filter(Boolean).join(' · ') || 'No address'}
                </span>
              </CardDescription>
              {inactive && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Inactive — hidden from customers</p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </div>
        </CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          {(branch.contactPhone || branch.contactEmail) && (
            <p>
              {branch.contactPhone && <span>{branch.contactPhone}</span>}
              {branch.contactPhone && branch.contactEmail && ' · '}
              {branch.contactEmail && <span>{branch.contactEmail}</span>}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
