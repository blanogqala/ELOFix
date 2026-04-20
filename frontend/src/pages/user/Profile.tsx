import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  User as UserIcon, 
  Camera, 
  Phone, 
  Mail, 
  Shield,
  Lock,
  Eye,
  Smartphone,
  Save
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserProfile {
  phone: string;
  profileImage?: string;
}

export default function UserProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile>({ phone: '', profileImage: undefined });
  const [originalProfile, setOriginalProfile] = useState<UserProfile>({ phone: '', profileImage: undefined });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = useCallback(() => {
    if (!user) return;
    const nextProfile = {
      phone: typeof (user as { phone?: string }).phone === 'string' ? (user as { phone?: string }).phone || '' : '',
      profileImage: typeof (user as { profileImage?: string }).profileImage === 'string'
        ? (user as { profileImage?: string }).profileImage
        : undefined,
    };
    setProfile(nextProfile);
    setOriginalProfile(nextProfile);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user, loadProfile]);

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(originalProfile);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    toast({
      title: 'Not implemented',
      description: 'User profile update endpoint is not implemented in the backend yet.',
      variant: 'destructive',
    });
    setIsSaving(false);
  };

  const handleImageUpload = () => {
    toast({
      title: 'Not implemented',
      description: 'User profile image upload endpoint is not implemented in the backend yet.',
      variant: 'destructive',
    });
  };

  const validatePhone = (phone: string) => {
    // Basic phone validation
    const phoneRegex = /^\+?[\d\s-()]{10,}$/;
    return phoneRegex.test(phone);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="card-elevated p-6">
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-6 w-40 bg-muted rounded" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Profile Settings</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Manage your account information</p>
          </div>
          {hasChanges && (
            <Button 
              className="btn-accent h-10 w-full shrink-0 whitespace-nowrap sm:w-auto" 
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>

        {/* Profile Header */}
        <div className="card-elevated p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                {profile.profileImage ? (
                  <img 
                    src={profile.profileImage} 
                    alt="Profile" 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-12 w-12 text-primary" />
                )}
              </div>
              <button
                onClick={handleImageUpload}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-semibold">{user?.name}</h2>
              <p className="text-muted-foreground">{user?.email}</p>
              <span className="inline-block mt-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
                Verified Account
              </span>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="card-elevated p-4 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <UserIcon className="h-4 w-4 shrink-0 text-primary" />
            Personal Information
          </h3>
          
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-muted-foreground">Full Name</Label>
                <div className="relative mt-1">
                  <Input
                    id="name"
                    value={user?.name || ''}
                    disabled
                    className="bg-muted/50 cursor-not-allowed"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Name cannot be changed</p>
              </div>
              
              <div>
                <Label htmlFor="email" className="text-muted-foreground">Email Address</Label>
                <div className="relative mt-1">
                  <Input
                    id="email"
                    value={user?.email || ''}
                    disabled
                    className="bg-muted/50 cursor-not-allowed"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="pl-10"
                />
              </div>
              {profile.phone && !validatePhone(profile.phone) && (
                <p className="text-xs text-destructive mt-1">Please enter a valid phone number</p>
              )}
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="card-elevated p-4 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <Shield className="h-4 w-4 shrink-0 text-primary" />
            Security
          </h3>
          
          <div className="space-y-4">
            <div 
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 cursor-not-allowed opacity-60"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Change Password</p>
                  <p className="text-sm text-muted-foreground">Update your password</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Coming Soon</span>
            </div>

            <div 
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 cursor-not-allowed opacity-60"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Coming Soon</span>
            </div>

            <div 
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 cursor-not-allowed opacity-60"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Login Activity</p>
                  <p className="text-sm text-muted-foreground">View recent login sessions</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Coming Soon</span>
            </div>
          </div>
        </div>

        {/* Save Button Mobile */}
        {hasChanges && (
          <div className="sticky bottom-4 sm:hidden">
            <Button 
              className="btn-accent h-10 w-full whitespace-nowrap" 
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
