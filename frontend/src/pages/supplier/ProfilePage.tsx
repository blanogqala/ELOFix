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
  });

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
      accountPhone: user.phone ?? '',
      accountEmail: profile.accountEmail ?? user.email ?? '',
      logoPreview: profile.logo ?? '',
    });
  }, [profile, user]);

  const invalidateProfile = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplier', 'profile', userId] });
  };

  const mutSave = useMutation({
    mutationFn: () =>
      patchSupplierProfile({
        storeDisplayName: biz.storeDisplayName.trim(),
        businessName: biz.businessName.trim(),
        address: biz.address.trim(),
        phone: biz.phone.trim(),
        contactName: biz.contactName.trim(),
        accountPhone: biz.accountPhone.trim(),
        accountEmail: biz.accountEmail.trim(),
      }),
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
      <div className="animate-fade-in mx-auto max-w-xl space-y-8">
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
            <Button type="button" className="btn-accent" disabled={mutSave.isPending} onClick={() => mutSave.mutate()}>
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
