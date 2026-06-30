import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProviderProfileSkeleton } from '@/components/common/loading';
import { useAuth } from '@/contexts/AuthContext';
import { getSupplierMe, patchBranchStaffProfile } from '@/lib/api/supplierPortal';
import type { SupplierBranchProfile } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { formatCurrency } from '@/lib/formatCurrency';

export default function BranchStaffProfilePage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const branch: SupplierBranchProfile | undefined = profile?.branches?.[0];
  const logoUrl = resolveUploadUrl(profile?.supplierLogo || profile?.logo || branch?.logo);

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [hasDelivery, setHasDelivery] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  useEffect(() => {
    if (!branch) return;
    setAddress(branch.address ?? '');
    setCity(branch.city ?? '');
    setArea(branch.area ?? '');
    setContactPhone(branch.contactPhone ?? '');
    setContactEmail(branch.contactEmail ?? '');
    setHasDelivery(branch.hasDelivery !== false);
    setDeliveryFee(String(branch.deliveryFee ?? 0));
    setLat(branch.latitude != null ? String(branch.latitude) : '');
    setLng(branch.longitude != null ? String(branch.longitude) : '');
  }, [branch]);

  const saveMut = useMutation({
    mutationFn: () => {
      const latN = lat.trim() === '' ? null : Number(lat);
      const lngN = lng.trim() === '' ? null : Number(lng);
      return patchBranchStaffProfile({
        address: address.trim() || null,
        city: city.trim() || null,
        area: area.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        hasDelivery,
        deliveryFee: Number(deliveryFee) || 0,
        latitude: latN !== null && !Number.isNaN(latN) ? latN : null,
        longitude: lngN !== null && !Number.isNaN(lngN) ? lngN : null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
      toast({ title: 'Profile updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading || !profile) {
    return (
      <DashboardLayout>
        <ProviderProfileSkeleton />
      </DashboardLayout>
    );
  }

  const loginEmail = profile.loginEmail || profile.accountEmail || '—';

  return (
    <DashboardLayout>
      <div className="animate-fade-in mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Branch profile</h1>
          <p className="text-sm text-muted-foreground">
            Brand logo comes from your supplier. Login email is read-only; customers see the contact fields below.
          </p>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">Brand</CardTitle>
            <CardDescription>Shared with all branches until the supplier updates it.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-16 w-16 rounded-full border object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">
                Logo
              </div>
            )}
            <div>
              <p className="font-medium">{profile.businessName || profile.name}</p>
              <p className="text-xs text-muted-foreground">{branch?.displayName || branch?.name}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">Login</CardTitle>
            <CardDescription>Password changes go through your supplier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Email</Label>
            <Input value={loginEmail} disabled readOnly className="bg-muted/50" />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">Customer contact & location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bf-addr">Address</Label>
              <Input id="bf-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bf-city">City</Label>
                <Input id="bf-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bf-area">Area / suburb</Label>
                <Input id="bf-area" value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bf-phone">Contact phone (public)</Label>
                <Input id="bf-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bf-email">Contact email (public)</Label>
                <Input id="bf-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bf-lat">Latitude (optional)</Label>
                <Input id="bf-lat" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bf-lng">Longitude (optional)</Label>
                <Input id="bf-lng" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Offers delivery</p>
                <p className="text-xs text-muted-foreground">Turn off if this branch is pickup-only.</p>
              </div>
              <Switch checked={hasDelivery} onCheckedChange={setHasDelivery} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bf-fee">Delivery fee</Label>
              <Input
                id="bf-fee"
                type="number"
                min={0}
                step="0.01"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                disabled={!hasDelivery}
              />
              <p className="text-xs text-muted-foreground">Preview: {formatCurrency(Number(deliveryFee) || 0)}</p>
            </div>
            <Button
              type="button"
              className="btn-accent"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
