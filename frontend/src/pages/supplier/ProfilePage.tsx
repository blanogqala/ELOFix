import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSupplierMe,
  patchSupplierProfile,
  uploadSupplierProfileLogo,
} from '@/lib/api/supplierPortal';
import { changePassword } from '@/lib/api/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { cn } from '@/lib/utils';

export default function SupplierProfilePage() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = user?.id ?? '';
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['supplier', 'profile', userId],
    queryFn: () => getSupplierMe(),
    enabled: Boolean(userId),
  });

  const [biz, setBiz] = useState({
    storeDisplayName: '',
    businessName: '',
    address: '',
    phone: '',
    contactName: '',
    accountPhone: '',
    accountEmail: '',
    logoPreview: '',
    hasDelivery: true,
    deliveryFee: '',
    storeLat: '',
    storeLng: '',
  });

  const [gpsPinLoading, setGpsPinLoading] = useState(false);

  const [pwd, setPwd] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [pwdErrors, setPwdErrors] = useState<{ next?: string; confirm?: string }>({});

  useEffect(() => {
    if (!profile || !user) return;
    setBiz({
      storeDisplayName: profile.name ?? '',
      businessName: profile.businessName ?? '',
      address: profile.address ?? '',
      phone: profile.phone ?? '',
      contactName: user.name ?? '',
      accountPhone: profile.accountPhone ?? ('phone' in user ? user.phone ?? '' : ''),
      accountEmail: profile.accountEmail ?? user.email ?? '',
      logoPreview: profile.logo ?? '',
      hasDelivery: profile.hasDelivery ?? true,
      deliveryFee: String(profile.deliveryFee ?? 0),
      storeLat:
        profile.latitude !== undefined && profile.latitude !== null
          ? String(profile.latitude)
          : '',
      storeLng:
        profile.longitude !== undefined && profile.longitude !== null
          ? String(profile.longitude)
          : '',
    });
  }, [profile, user]);

  const invalidateProfile = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
  };

  const captureStorePinFromGps = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Not supported', description: 'Your browser cannot read GPS.', variant: 'destructive' });
      return;
    }
    setGpsPinLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPinLoading(false);
        setBiz((b) => ({
          ...b,
          storeLat: pos.coords.latitude.toFixed(6),
          storeLng: pos.coords.longitude.toFixed(6),
        }));
        toast({ title: 'Store pin updated', description: 'Save profile to store these coordinates.' });
      },
      (err) => {
        setGpsPinLoading(false);
        const msg =
          err.code === 1
            ? 'Location permission denied.'
            : err.code === 2
              ? 'Position unavailable.'
              : 'Location request timed out.';
        toast({ title: 'Could not read location', description: msg, variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
    );
  };

  const mutSave = useMutation({
    mutationFn: () => {
      const latRaw = biz.storeLat.trim();
      const lngRaw = biz.storeLng.trim();
      if (latRaw && !lngRaw) {
        throw new Error('Enter both latitude and longitude, or clear both.');
      }
      if (!latRaw && lngRaw) {
        throw new Error('Enter both latitude and longitude, or clear both.');
      }

      return patchSupplierProfile({
        storeDisplayName: biz.storeDisplayName.trim(),
        businessName: biz.businessName.trim(),
        address: biz.address.trim(),
        phone: biz.phone.trim(),
        contactName: biz.contactName.trim(),
        accountPhone: biz.accountPhone.trim(),
        accountEmail: biz.accountEmail.trim(),
        hasDelivery: biz.hasDelivery,
        deliveryFee: Number(biz.deliveryFee || 0),
        latitude: latRaw ? Number(latRaw) : null,
        longitude: lngRaw ? Number(lngRaw) : null,
      });
    },
    onSuccess: async () => {
      invalidateProfile();
      await refreshProfile();
      toast({ title: 'Profile saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const mutLogo = useMutation({
    mutationFn: (file: File) => uploadSupplierProfileLogo(file),
    onSuccess: (data) => {
      setBiz((b) => ({ ...b, logoPreview: data.profile.logo ?? b.logoPreview }));
      invalidateProfile();
      void refreshProfile();
      toast({ title: 'Logo updated' });
      if (logoInputRef.current) logoInputRef.current.value = '';
    },
    onError: (e: Error) => toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }),
  });

  const mutPwd = useMutation({
    mutationFn: () => changePassword(pwd.current, pwd.next),
    onSuccess: async () => {
      setPwd({ current: '', next: '', confirm: '' });
      setPwdErrors({});
      await refreshProfile();
      toast({ title: 'Password updated' });
    },
    onError: (e: Error) => toast({ title: 'Password change failed', description: e.message, variant: 'destructive' }),
  });

  const onPickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void mutLogo.mutateAsync(f).catch(() => {});
  };

  const submitPassword = () => {
    const err: typeof pwdErrors = {};
    if (pwd.next.length > 0 && pwd.next.length < 8) {
      err.next = 'Use at least 8 characters';
    }
    if (pwd.next !== pwd.confirm) {
      err.confirm = 'Passwords do not match';
    }
    setPwdErrors(err);
    if (Object.keys(err).length || !pwd.current || !pwd.next) {
      if (!pwd.current || !pwd.next) {
        toast({ title: 'Fill current and new password', variant: 'destructive' });
      }
      return;
    }
    void mutPwd.mutateAsync().catch(() => {});
  };

  const logoSrc = biz.logoPreview ? resolveUploadUrl(biz.logoPreview) : '';

  return (
    <DashboardLayout>
      <div className="animate-fade-in mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Profile</h1>
          <p className="text-sm text-muted-foreground">Business details, email, and security.</p>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Store & contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Profile image</Label>
              <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <div
                  className={cn(
                    'flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs text-muted-foreground'
                  )}
                >
                  {logoSrc ? (
                    <img src={logoSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    'Logo'
                  )}
                </div>
                <div>
                  <Input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="max-w-xs cursor-pointer"
                    onChange={onPickLogo}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP, or GIF · up to 8 MB.</p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="supplier-email">Email (login)</Label>
              <Input
                id="supplier-email"
                type="email"
                autoComplete="email"
                value={biz.accountEmail}
                onChange={(e) => setBiz((b) => ({ ...b, accountEmail: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplier-store-name">Store display name</Label>
              <Input
                id="supplier-store-name"
                value={biz.storeDisplayName}
                onChange={(e) => setBiz((b) => ({ ...b, storeDisplayName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplier-biz-name">Business name</Label>
              <Input
                id="supplier-biz-name"
                value={biz.businessName}
                onChange={(e) => setBiz((b) => ({ ...b, businessName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplier-biz-phone">Business phone</Label>
              <Input
                id="supplier-biz-phone"
                value={biz.phone}
                onChange={(e) => setBiz((b) => ({ ...b, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplier-address">Address</Label>
              <Input id="supplier-address" value={biz.address} onChange={(e) => setBiz((b) => ({ ...b, address: e.target.value }))} />
            </div>
            <div className="rounded-md border border-border p-3 space-y-3">
              <div>
                <Label>Store location pin (optional)</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Latitude and longitude help customers see which stores are closest. Stand at your shop or warehouse
                  entrance and tap the button, or paste coordinates.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Latitude (e.g. -33.928)"
                  inputMode="decimal"
                  value={biz.storeLat}
                  onChange={(e) => setBiz((b) => ({ ...b, storeLat: e.target.value }))}
                  className="sm:flex-1"
                />
                <Input
                  placeholder="Longitude (e.g. 18.418)"
                  inputMode="decimal"
                  value={biz.storeLng}
                  onChange={(e) => setBiz((b) => ({ ...b, storeLng: e.target.value }))}
                  className="sm:flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={gpsPinLoading} onClick={captureStorePinFromGps}>
                  {gpsPinLoading ? <>Locating…</> : <>Use device GPS pin</>}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setBiz((b) => ({ ...b, storeLat: '', storeLng: '' }))}
                >
                  Clear pin
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="supplier-has-delivery">Offers delivery</Label>
                <Switch
                  id="supplier-has-delivery"
                  checked={biz.hasDelivery}
                  onCheckedChange={(checked) => setBiz((b) => ({ ...b, hasDelivery: checked }))}
                />
              </div>
              {biz.hasDelivery && (
                <div>
                  <Label htmlFor="supplier-delivery-fee">Delivery fee</Label>
                  <Input
                    id="supplier-delivery-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={biz.deliveryFee}
                    onChange={(e) => setBiz((b) => ({ ...b, deliveryFee: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="supplier-contact-name">Contact name</Label>
              <Input
                id="supplier-contact-name"
                value={biz.contactName}
                onChange={(e) => setBiz((b) => ({ ...b, contactName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplier-account-phone">Account phone</Label>
              <Input
                id="supplier-account-phone"
                value={biz.accountPhone}
                onChange={(e) => setBiz((b) => ({ ...b, accountPhone: e.target.value }))}
              />
            </div>
            <Button
              type="button"
              className="btn-accent"
              disabled={mutSave.isPending}
              onClick={() => {
                if (!biz.address.trim()) {
                  toast({ title: 'Address is required', description: 'Enter your store / warehouse address.', variant: 'destructive' });
                  return;
                }
                mutSave.mutate();
              }}
            >
              {mutSave.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="pwd-current">Current password</Label>
              <Input
                id="pwd-current"
                type="password"
                autoComplete="current-password"
                value={pwd.current}
                onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="pwd-new">New password</Label>
              <Input
                id="pwd-new"
                type="password"
                autoComplete="new-password"
                value={pwd.next}
                onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
                className={cn(pwdErrors.next && 'border-destructive')}
              />
              {pwdErrors.next && <p className="mt-1 text-xs text-destructive">{pwdErrors.next}</p>}
            </div>
            <div>
              <Label htmlFor="pwd-confirm">Confirm new password</Label>
              <Input
                id="pwd-confirm"
                type="password"
                autoComplete="new-password"
                value={pwd.confirm}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                className={cn(pwdErrors.confirm && 'border-destructive')}
              />
              {pwdErrors.confirm && <p className="mt-1 text-xs text-destructive">{pwdErrors.confirm}</p>}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={mutPwd.isPending}
              onClick={submitPassword}
            >
              {mutPwd.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
