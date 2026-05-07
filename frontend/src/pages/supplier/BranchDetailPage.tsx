import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BranchStaffSection } from '@/components/supplier/BranchStaffSection';
import { useAuth } from '@/contexts/AuthContext';
import {
  deleteSupplierBranch,
  getSupplierBranch,
  patchSupplierBranch,
} from '@/lib/api/supplierPortal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trash2 } from 'lucide-react';

export default function BranchDetailPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: branch, isLoading, error } = useQuery({
    queryKey: ['supplier', 'branch', userId, branchId],
    queryFn: () => getSupplierBranch(branchId!),
    enabled: Boolean(userId && branchId),
  });

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [hasDelivery, setHasDelivery] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!branch) return;
    setName(branch.name || '');
    setAddress(branch.address || '');
    setCity(branch.city || '');
    setArea(branch.area || '');
    setContactPhone(branch.contactPhone || '');
    setContactEmail(branch.contactEmail || '');
    setHasDelivery(branch.hasDelivery !== false);
    setDeliveryFee(String(branch.deliveryFee ?? 0));
    setLat(branch.latitude != null ? String(branch.latitude) : '');
    setLng(branch.longitude != null ? String(branch.longitude) : '');
    setIsActive(branch.isActive !== false);
  }, [branch]);

  const saveMut = useMutation({
    mutationFn: () => {
      const latN = lat.trim() === '' ? null : Number(lat);
      const lngN = lng.trim() === '' ? null : Number(lng);
      return patchSupplierBranch(branchId!, {
        name: name.trim(),
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        area: area.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        hasDelivery,
        deliveryFee: hasDelivery ? Number(deliveryFee) || 0 : 0,
        latitude: latN !== null && !Number.isNaN(latN) ? latN : null,
        longitude: lngN !== null && !Number.isNaN(lngN) ? lngN : null,
        isActive,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'branch', userId, branchId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'branches', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
      toast({ title: 'Branch updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSupplierBranch(branchId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'branches', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
      setDeleteOpen(false);
      toast({ title: 'Branch deleted' });
      navigate('/supplier/branches');
    },
    onError: (e: Error) => {
      toast({
        title: 'Cannot delete branch',
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  if (!branchId) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground">Missing branch.</p>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </DashboardLayout>
    );
  }

  if (error || !branch) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Branch not found or you don&apos;t have access.</p>
          <Button asChild variant="outline">
            <Link to="/supplier/branches">Back to branches</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
            <Link to="/supplier/branches">
              <ArrowLeft className="h-4 w-4" />
              All branches
            </Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete branch
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">{branch.displayName || branch.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Edit branch details shown to customers and staff.</p>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Branch details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bd-name">Branch name</Label>
              <Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bd-addr">Address</Label>
              <Input id="bd-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bd-city">City</Label>
                <Input id="bd-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bd-area">Area / suburb</Label>
                <Input id="bd-area" value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bd-phone">Public phone</Label>
                <Input id="bd-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bd-email">Public email</Label>
                <Input id="bd-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <div>
                <Label htmlFor="bd-delivery">Offers delivery</Label>
                <p className="text-xs text-muted-foreground">Customers see this branch delivery fee when applicable</p>
              </div>
              <Switch id="bd-delivery" checked={hasDelivery} onCheckedChange={setHasDelivery} />
            </div>
            {hasDelivery && (
              <div className="space-y-2">
                <Label htmlFor="bd-fee">Delivery fee</Label>
                <Input
                  id="bd-fee"
                  type="number"
                  min={0}
                  step={0.01}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bd-lat">Latitude</Label>
                <Input id="bd-lat" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bd-lng">Longitude</Label>
                <Input id="bd-lng" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="bd-active" />
              <Label htmlFor="bd-active">Active (visible to customers in store search)</Label>
            </div>

            {branch.createdAt && (
              <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                Created {new Date(branch.createdAt).toLocaleString()}
                {branch.updatedAt ? ` · Updated ${new Date(branch.updatedAt).toLocaleString()}` : ''}
              </p>
            )}

            <Button type="button" className="btn-accent" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="pt-6">
            <BranchStaffSection branchId={branch.id} />
          </CardContent>
        </Card>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this branch?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the branch, its inventory categories, and branch staff logins permanently — only if the
                branch has no material orders on record. If you have orders, deactivate the branch instead using the
                toggle above.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? 'Deleting…' : 'Delete permanently'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
