import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  getProviderById,
  updateProvider,
  uploadProviderAvatar,
  uploadWorkPostImage,
  submitProviderForReview,
} from '@/lib/api/providers';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { compressImageForUpload } from '@/lib/imageCompression';
import {
  getCategories,
  getServiceAreas,
  getMyCategorySuggestions,
  suggestCategory,
  type CategorySuggestion,
} from '@/lib/api/categories';
import { evaluateProviderCoreSections } from '@/lib/providerProfileCompletion';
import { validateSkillPricingDraft } from '@/lib/providerLaborPricing';
import { useProviderStatus } from '@/hooks/useProviderStatus';
import { Category, Provider, WorkPost, ProviderSettings } from '@/types';
import {
  Save, Plus, X, Upload, AlertCircle,
  Banknote, Image, Trash2, Pencil,
  Bell, CalendarClock, Camera, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProviderVerificationDocuments } from '@/components/provider/ProviderVerificationDocuments';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { socket } from '@/lib/socket';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

type ProfileInfoErrors = {
  phone?: boolean;
  businessName?: boolean;
  bio?: boolean;
  serviceAreas?: boolean;
};

const ONBOARDING_KEY = 'provider_onboarding_seen';

export default function ProviderProfile() {
  const { user, refreshProfile } = useAuth();
  const { isApproved, isProfileComplete } = useProviderStatus();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const workPostImageInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile info state
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [bio, setBio] = useState('');
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [errors, setErrors] = useState<ProfileInfoErrors>({});

  // Skills & Pricing state
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [pricing, setPricing] = useState<Provider['laborPricing']>({});
  /** Local string so providers can edit per-km Rand without keystroke jitter. */
  const [deliveryKmInput, setDeliveryKmInput] = useState('');
  const [vehicleTypeInput, setVehicleTypeInput] = useState('');
  const [numberPlateInput, setNumberPlateInput] = useState('');

  // Work posts state
  const [workPosts, setWorkPosts] = useState<WorkPost[]>([]);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<WorkPost | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [postCategory, setPostCategory] = useState('');
  const [postFilterCategory, setPostFilterCategory] = useState<string>('all');
  const [postImages, setPostImages] = useState<string[]>([]);

  const [serviceAreaOptions, setServiceAreaOptions] = useState<string[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState('');
  const [suggestDescription, setSuggestDescription] = useState('');
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);
  const [suggestedServices, setSuggestedServices] = useState<CategorySuggestion[]>([]);
  const [profileTab, setProfileTab] = useState<string>('info');
  const [manualAreaInput, setManualAreaInput] = useState('');

  // Settings state
  const defaultSettings = useMemo<ProviderSettings>(
    () => ({
      notifications: { jobRequests: true, payments: true, marketing: false },
      availability: true,
      businessHours: {
        Monday: { open: '08:00', close: '17:00', enabled: true },
        Tuesday: { open: '08:00', close: '17:00', enabled: true },
        Wednesday: { open: '08:00', close: '17:00', enabled: true },
        Thursday: { open: '08:00', close: '17:00', enabled: true },
        Friday: { open: '08:00', close: '17:00', enabled: true },
        Saturday: { open: '09:00', close: '13:00', enabled: false },
        Sunday: { open: '09:00', close: '13:00', enabled: false },
      },
    }),
    [],
  );
  const [settings, setSettings] = useState<ProviderSettings>(defaultSettings);

  useEffect(() => {
    if (user?.role === 'provider' && 'phone' in user && user.phone) {
      const p = String(user.phone).trim();
      if (p) setPhone((prev) => (prev.trim() ? prev : p));
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setOnboardingOpen(true);
    }
  }, []);

  const loadServiceAreas = useCallback(async () => {
    try {
      setServiceAreaOptions(await getServiceAreas());
    } catch {
      setServiceAreaOptions([]);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getCategories());
    } catch {
      setCategories([]);
    }
  }, []);

  const loadProvider = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getProviderById(user.id);
      if (data) {
        setProvider(data);
        const phoneFromApi = (data.phone && String(data.phone).trim()) || '';
        const phoneFromSession =
          user.role === 'provider' && 'phone' in user && user.phone
            ? String(user.phone).trim()
            : '';
        setPhone(phoneFromApi || phoneFromSession);
        setBusinessName(data.businessName || '');
        setBio(data.bio || '');
        setServiceAreas(data.serviceAreas || []);
        setSelectedSkills(data.skills);
        setPricing(data.laborPricing);
        setWorkPosts(data.workPosts || []);
        const set = data.settings || defaultSettings;
        setSettings(set);
        setDeliveryKmInput(
          set.deliveryRatePerKm != null && Number.isFinite(set.deliveryRatePerKm)
            ? String(set.deliveryRatePerKm)
            : ''
        );
        setVehicleTypeInput(data.vehicleType || '');
        setNumberPlateInput(data.numberPlate || '');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load provider profile.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [defaultSettings, toast, user]);

  const loadMySuggestions = useCallback(async () => {
    if (!user) return;
    try {
      const suggestions = await getMyCategorySuggestions();
      setSuggestedServices(suggestions.filter((s) => s.status === 'PENDING'));
    } catch {
      setSuggestedServices([]);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadProvider();
      void loadMySuggestions();
    }
    void loadCategories();
    void loadServiceAreas();
  }, [user, loadCategories, loadProvider, loadServiceAreas, loadMySuggestions]);

  useEffect(() => {
    if (!user) return undefined;
    const handleSuggestionEvent = async (payload?: {
      userId?: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    }) => {
      if (payload?.userId && payload.userId !== user.id) return;
      if (payload?.status === 'APPROVED') {
        toast({
          title: 'Service approved and added to your profile',
          description: 'Your approved service is now active.',
        });
      }
      await Promise.all([loadMySuggestions(), loadProvider(), loadCategories()]);
    };
    socket.on('category_suggestion:created', handleSuggestionEvent);
    socket.on('category_suggestion:updated', handleSuggestionEvent);
    const pollingId = window.setInterval(() => {
      void loadMySuggestions();
      void loadProvider();
      void loadCategories();
    }, 30000);
    const onFocus = () => {
      void loadMySuggestions();
      void loadProvider();
      void loadCategories();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      socket.off('category_suggestion:created', handleSuggestionEvent);
      socket.off('category_suggestion:updated', handleSuggestionEvent);
      window.clearInterval(pollingId);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, loadMySuggestions, loadProvider, loadCategories, toast]);

  // ── Profile Info Save ──
  const handleSaveProfile = async () => {
    if (!user) return;
    const newErrors: ProfileInfoErrors = {};

    if (!phone.trim()) newErrors.phone = true;
    if (!businessName.trim()) newErrors.businessName = true;
    if ((bio?.trim().length || 0) < 20) newErrors.bio = true;
    if (serviceAreas.length === 0) newErrors.serviceAreas = true;

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast({
        title: 'Missing required fields',
        description: 'Please complete all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateProvider(user.id, { phone, businessName, bio, serviceAreas });
      setProvider(updated);
      await refreshProfile();
      await loadProvider();
      const refreshed = evaluateProviderCoreSections(updated, {
        phone,
        businessName,
        bio,
        serviceAreas,
        selectedSkills,
        pricing,
      });
      if (refreshed.profileInfo) {
        if (!refreshed.skillsAndPrices) setProfileTab('pricing');
        else if (!refreshed.documents) setProfileTab('docs');
      }
      toast({ title: 'Profile saved', description: 'Your profile info has been updated.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Skills & Pricing ──
  const handleToggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(prev => prev.filter(s => s !== skillId));
      const p = { ...pricing };
      delete p[skillId];
      setPricing(p);
    } else {
      setSelectedSkills(prev => [...prev, skillId]);
      setPricing((prev) => ({ ...prev, [skillId]: { ...(prev[skillId] || {}) } }));
    }
  };

  const handleSavePricing = async () => {
    if (!user) return;
    for (const skill of selectedSkills) {
      const check = validateSkillPricingDraft(pricing[skill] ?? {});
      if (!check.ok) {
        toast({
          title: 'Check your amounts',
          description: `${categories.find((c) => c.id === skill)?.name ?? skill}: ${check.message}`,
          variant: 'destructive',
        });
        return;
      }
    }
    let deliveryPatch: ProviderSettings['deliveryRatePerKm'] | null = null;
    if (deliveryKmInput.trim() === '') {
      deliveryPatch = null;
    } else {
      const pk = Number(deliveryKmInput.trim());
      if (!Number.isFinite(pk) || pk < 0) {
        toast({ title: 'Invalid delivery rate', description: 'Use a Rand amount per kilometre ≥ 0, or leave blank.', variant: 'destructive' });
        return;
      }
      deliveryPatch = pk;
    }

    setIsSaving(true);
    try {
      const settingsOut = {
        ...settings,
        deliveryRatePerKm: deliveryPatch === null ? null : deliveryPatch,
      } as ProviderSettings;

      const next = await updateProvider(user.id, {
        skills: selectedSkills,
        laborPricing: pricing,
        settings: settingsOut,
        vehicleType: selectedSkills.includes('delivery') ? vehicleTypeInput.trim() || null : null,
        numberPlate: selectedSkills.includes('delivery') ? numberPlateInput.trim() || null : null,
      });
      setProvider(next);
      const savedSet = next.settings ?? settingsOut;
      setSettings(savedSet);
      setDeliveryKmInput(
        next.settings?.deliveryRatePerKm != null && Number.isFinite(next.settings.deliveryRatePerKm)
          ? String(next.settings.deliveryRatePerKm)
          : ''
      );
      await refreshProfile();
      const refreshed = evaluateProviderCoreSections(next, {
        phone,
        businessName,
        bio,
        serviceAreas,
        selectedSkills,
        pricing,
      });
      if (refreshed.skillsAndPrices && !refreshed.documents) {
        setProfileTab('docs');
      }
      toast({
        title: 'Saved',
        description: 'Your services, labour guide (ZAR) and optional delivery-per-km rate are updated.',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to save pricing.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Work Posts ──
  const openNewPost = () => {
    setEditingPost(null);
    setPostTitle('');
    setPostDescription('');
    setPostCategory(selectedSkills[0] || '');
    setPostImages([]);
    setPostModalOpen(true);
  };

  const openEditPost = (post: WorkPost) => {
    setEditingPost(post);
    setPostTitle(post.title);
    setPostDescription(post.description);
    setPostCategory(post.categoryId);
    setPostImages(Array.isArray(post.images) ? [...post.images] : []);
    setPostModalOpen(true);
  };

  const handleSavePost = async () => {
    if (!user || !postTitle || !postCategory) return;
    const images =
      postImages.length > 0 ? postImages : ['/placeholder.svg'];
    let updatedPosts: WorkPost[];
    if (editingPost) {
      updatedPosts = workPosts.map(p =>
        p.id === editingPost.id
          ? { ...p, title: postTitle, description: postDescription, categoryId: postCategory, images }
          : p
      );
    } else {
      const newPost: WorkPost = {
        id: `wp-${Date.now()}`,
        categoryId: postCategory,
        title: postTitle,
        description: postDescription,
        images,
        createdAt: new Date().toISOString(),
      };
      updatedPosts = [...workPosts, newPost];
    }
    try {
      const updated = await updateProvider(user.id, { workPosts: updatedPosts });
      setProvider(updated);
      setWorkPosts(updated.workPosts || updatedPosts);
      await refreshProfile();
      setPostModalOpen(false);
      toast({ title: editingPost ? 'Post updated' : 'Post created' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save post.', variant: 'destructive' });
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user) return;
    const updatedPosts = workPosts.filter(p => p.id !== postId);
    try {
      const updated = await updateProvider(user.id, { workPosts: updatedPosts });
      setProvider(updated);
      setWorkPosts(updated.workPosts || updatedPosts);
      await refreshProfile();
      toast({ title: 'Post deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete post.', variant: 'destructive' });
    }
  };

  const filteredPosts = postFilterCategory === 'all'
    ? workPosts
    : workPosts.filter(p => p.categoryId === postFilterCategory);

  const coreSections = useMemo(
    () =>
      evaluateProviderCoreSections(provider, {
        phone,
        businessName,
        bio,
        serviceAreas,
        selectedSkills,
        pricing,
      }),
    [provider, phone, businessName, bio, serviceAreas, selectedSkills, pricing]
  );

  const completionDetails = useMemo(() => {
    const postsOk = workPosts.length >= 1;
    return {
      infoOk: coreSections.profileInfo,
      skillsOk: coreSections.skillsAndPrices,
      docsOk: coreSections.documents,
      postsOk,
    };
  }, [coreSections, workPosts.length]);

  const completionPercent = coreSections.percentCore;

  const dismissOnboarding = () => {
    setOnboardingOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ONBOARDING_KEY, '1');
    }
  };

  const handleSuggestSubmit = async () => {
    const name = suggestText.trim();
    if (name.length < 2) {
      toast({ title: 'Enter a service name', variant: 'destructive' });
      return;
    }
    setSuggestSubmitting(true);
    try {
      await suggestCategory({
        serviceName: name,
        ...(suggestDescription.trim() ? { description: suggestDescription.trim() } : {}),
      });
      setSuggestOpen(false);
      setSuggestText('');
      setSuggestDescription('');
      await loadMySuggestions();
      toast({ title: 'Suggestion sent', description: 'An admin will review your category request.' });
    } catch {
      toast({ title: 'Error', description: 'Could not send suggestion.', variant: 'destructive' });
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const addManualServiceArea = () => {
    const v = manualAreaInput.trim();
    if (!v) return;
    setServiceAreas((prev) => (prev.includes(v) ? prev : [...prev, v]));
    if (errors.serviceAreas) setErrors((prev) => ({ ...prev, serviceAreas: false }));
    setManualAreaInput('');
  };

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !file.type.startsWith('image/')) return;
    if (file.size > 5_000_000) {
      toast({ title: 'Image too large', description: 'Please choose an image under 5 MB.', variant: 'destructive' });
      return;
    }
    try {
      const compressed = await compressImageForUpload(file);
      const updated = await uploadProviderAvatar(user.id, compressed);
      setProvider(updated);
      await refreshProfile();
      toast({ title: 'Profile photo updated' });
    } catch {
      toast({ title: 'Error', description: 'Could not save profile photo.', variant: 'destructive' });
    }
  };

  const handleAddWorkPostImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !file.type.startsWith('image/')) return;
    if (file.size > 5_000_000) {
      toast({ title: 'Image too large', description: 'Please choose an image under 5 MB.', variant: 'destructive' });
      return;
    }
    try {
      const url = await uploadWorkPostImage(user.id, file);
      setPostImages((prev) => [...prev, url]);
      toast({ title: 'Image added' });
    } catch {
      toast({ title: 'Error', description: 'Could not upload image.', variant: 'destructive' });
    }
  };

  const handleSubmitForReview = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const updated = await submitProviderForReview(user.id);
      setProvider(updated);
      await refreshProfile();
      await loadProvider();
      toast({ title: 'Submitted for review', description: 'An admin will review your profile.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Complete your profile first, then try again.';
      toast({
        title: 'Could not submit',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  /** Badge priority: incomplete → pending approval → active */
  const renderStatusBadge = () => {
    if (isApproved && isProfileComplete) {
      return (
        <Badge className="shrink-0 border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
          Active
        </Badge>
      );
    }
    if (!isProfileComplete) {
      return (
        <Badge className="shrink-0 border-orange-400/50 bg-orange-500/15 text-orange-900 dark:text-orange-100">
          Incomplete Profile
        </Badge>
      );
    }
    return (
      <Badge className="shrink-0 border-amber-400/50 bg-amber-400/20 text-amber-950 dark:text-amber-100">
        Pending Approval
      </Badge>
    );
  };

  const smartBanner = () => {
    if (isProfileComplete && !isApproved) {
      return (
        <div className="rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          Your profile is under review. You&apos;ll be notified once approved.
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 p-4 md:space-y-8 sm:p-6 animate-fade-in">
        {smartBanner()}

        <div className="space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">Provider Profile</h1>
            <span className="text-xs text-muted-foreground sm:text-sm">Manage your public profile and onboarding</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Profile completion (info · skills · documents)</span>
              <span>{completionPercent}%</span>
            </div>
            <Progress value={completionPercent} className="h-2" />
          </div>
        </div>

        <Tabs value={profileTab} onValueChange={setProfileTab} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 ">
            <TabsTrigger value="info" className="gap-1.5 text-xs sm:text-sm ">
              Profile {coreSections.profileInfo ? '✅' : '⚠️'}
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1.5 text-xs sm:text-sm">
              <span className="truncate">Skills &amp; Pricing {coreSections.skillsAndPrices ? '✅' : '⚠️'}</span>
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-1.5 text-xs sm:text-sm">
              Documents {coreSections.documents ? '✅' : '⚠️'}
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-1.5 text-xs sm:text-sm">
              Work Posts
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm col-span-2 sm:col-span-1">
              Settings
            </TabsTrigger>
          </TabsList>

          {/* ═══ PROFILE INFO ═══ */}
          <TabsContent value="info" className="space-y-6">
            <div className="card-elevated space-y-6 p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfileImageChange}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Change profile photo"
                  >
                    {provider?.profileImage ? (
                      <img
                        src={resolveUploadUrl(provider.profileImage)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-primary">
                        {(provider?.name || user?.name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="h-7 w-7 text-white" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold leading-tight tracking-tight break-words sm:text-2xl">
                      {provider?.name || user?.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground break-all">{provider?.email}</p>
                  </div>
                </div>
                <div className="shrink-0 sm:pt-1">{renderStatusBadge()}</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Phone Number</Label>
                    {errors.phone && <span className="text-xs text-destructive">Required</span>}
                  </div>
                  <Input
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: false }));
                    }}
                    placeholder="+27..."
                    className={errors.phone ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Business Name</Label>
                    {errors.businessName && <span className="text-xs text-destructive">Required</span>}
                  </div>
                  <Input
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      if (errors.businessName) setErrors((prev) => ({ ...prev, businessName: false }));
                    }}
                    placeholder="Your business name"
                    className={errors.businessName ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>About / Bio</Label>
                  {errors.bio && <span className="text-xs text-destructive">Required (min 20 characters)</span>}
                </div>
                <Textarea
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    if (errors.bio) setErrors((prev) => ({ ...prev, bio: false }));
                  }}
                  placeholder="Tell clients about your experience..."
                  rows={3}
                  className={errors.bio ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
              </div>

              <div className="space-y-3">
                <Label>Service Areas</Label>
                {serviceAreaOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Area list could not be loaded. Add your own areas below — you can still save your profile.
                  </p>
                )}
                {serviceAreaOptions.length > 0 && (
                  <div className={cn('flex flex-wrap gap-2 rounded-md p-1', errors.serviceAreas && 'border border-destructive')}>
                    {serviceAreaOptions.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setServiceAreas((prev) =>
                            prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
                          );
                          if (errors.serviceAreas) setErrors((prev) => ({ ...prev, serviceAreas: false }));
                        }}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-sm transition-colors',
                          serviceAreas.includes(area)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/30'
                        )}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="manual-area" className="text-xs text-muted-foreground">
                      Add area manually
                    </Label>
                    <Input
                      id="manual-area"
                      value={manualAreaInput}
                      onChange={(e) => setManualAreaInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addManualServiceArea();
                        }
                      }}
                      placeholder="e.g. Sandton, Southern Suburbs"
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={addManualServiceArea}>
                    Add area
                  </Button>
                </div>
                {errors.serviceAreas && (
                  <p className="text-xs text-destructive">Please select at least one service area.</p>
                )}
                {serviceAreas.some((a) => !serviceAreaOptions.includes(a)) && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
                    <span className="text-xs font-medium text-muted-foreground">Custom areas:</span>
                    {serviceAreas
                      .filter((a) => !serviceAreaOptions.includes(a))
                      .map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            setServiceAreas((prev) => prev.filter((a) => a !== area));
                            if (errors.serviceAreas) setErrors((prev) => ({ ...prev, serviceAreas: false }));
                          }}
                          className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary hover:bg-primary/20"
                        >
                          {area} ×
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <Button onClick={handleSaveProfile} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </TabsContent>

          {/* ═══ SKILLS & PRICING ═══ */}
          <TabsContent value="pricing" className="space-y-6">
            <div className="card-elevated p-6">
              <h3 className="font-semibold mb-4">Select Your Services</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleToggleSkill(cat.id)}
                    className={cn(
                      "p-4 rounded-lg border-2 transition-all text-center",
                      selectedSkills.includes(cat.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    )}
                  >
                    <div className="text-2xl mb-1">{cat.icon}</div>
                    <p className="text-sm font-medium">{cat.name}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setSuggestOpen(true)}>
                  + Suggest Service
                </Button>
              </div>
              <div className="mt-3 space-y-1.5">
                {suggestedServices.length === 0 ? (
                  <p className="text-xs text-muted-foreground/80">No suggestions yet</p>
                ) : (
                  suggestedServices.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="flex items-center gap-2 text-sm text-muted-foreground/90"
                    >
                      <span className="truncate">{suggestion.name}</span>
                      <Badge className="border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                        Pending
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedSkills.length > 0 && (
              <div className="card-elevated">
                <div className="p-6 border-b border-border space-y-1">
                  <h3 className="font-semibold">Set labour guide (whole job)</h3>
                  <p className="text-sm text-muted-foreground">
                    For each selected service, add the smallest and largest labour amounts you&apos;ve quoted or been paid for
                    a comparable job—all in Rand (whole job, not hourly or per m² unless you&apos;re still on a legacy profile).
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Leave both blank until your first payout if you&apos;re new; after completed paid jobs these bounds update
                    automatically.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {selectedSkills.map((skillId) => {
                    const cat = categories.find((c) => c.id === skillId);
                    const sp = pricing[skillId] || {};
                    return (
                      <div key={skillId} className="p-6">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-2xl">{cat?.icon}</span>
                              <div className="min-w-0">
                                <p className="font-medium">{cat?.name}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{cat?.description}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-destructive self-end sm:self-auto" type="button" onClick={() => handleToggleSkill(skillId)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                                <Banknote className="h-3 w-3" /> Lowest labour (job)
                              </Label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={50}
                                value={sp.jobFeeLow ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setPricing((prev) => ({
                                    ...prev,
                                    [skillId]: {
                                      ...prev[skillId],
                                      jobFeeLow: raw === '' ? undefined : Number(raw),
                                    },
                                  }));
                                }}
                                placeholder="Optional"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                                <Banknote className="h-3 w-3" /> Highest labour (job)
                              </Label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={50}
                                value={sp.jobFeeHigh ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setPricing((prev) => ({
                                    ...prev,
                                    [skillId]: {
                                      ...prev[skillId],
                                      jobFeeHigh: raw === '' ? undefined : Number(raw),
                                    },
                                  }));
                                }}
                                placeholder="Optional"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedSkills.includes('delivery') && (
              <div className="card-elevated p-6 space-y-4 border border-primary/25">
                <div>
                  <h3 className="font-semibold">Driving / delivery rate</h3>
                  <p className="text-sm text-muted-foreground">
                    Quote in Rand per kilometre. Final trip quotes will multiply your rate by route distance once routing is wired
                    into booking.
                  </p>
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="delivery-per-km">Rand per kilometre (optional)</Label>
                  <Input
                    id="delivery-per-km"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={deliveryKmInput}
                    onChange={(e) => setDeliveryKmInput(e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle-type">Vehicle type</Label>
                    <Input
                      id="vehicle-type"
                      value={vehicleTypeInput}
                      onChange={(e) => setVehicleTypeInput(e.target.value)}
                      placeholder="e.g. Bakkie, Van"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number-plate">Number plate</Label>
                    <Input
                      id="number-plate"
                      value={numberPlateInput}
                      onChange={(e) => setNumberPlateInput(e.target.value)}
                      placeholder="e.g. CA 123-456"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleSavePricing} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Skills & Pricing'}
            </Button>
          </TabsContent>

          {/* ═══ DOCUMENTS ═══ */}
          <TabsContent value="docs" className="space-y-6">
            {user && (
              <ProviderVerificationDocuments
                provider={provider}
                userId={user.id}
                onProviderUpdated={async (updated) => {
                  setProvider(updated);
                  await refreshProfile();
                }}
              />
            )}
          </TabsContent>

          {/* ═══ WORK POSTS ═══ */}
          <TabsContent value="posts" className="space-y-6">
            {selectedSkills.length > 0 && workPosts.length === 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                You must add at least one work post to activate your profile.
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Work Posts</h3>
                <p className="text-sm text-muted-foreground">Showcase work tagged to specific service categories</p>
              </div>
              <Button onClick={openNewPost} disabled={selectedSkills.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add Post
              </Button>
            </div>

            {selectedSkills.length === 0 && (
              <div className="card-elevated p-6 text-center text-muted-foreground text-sm">
                Select services in the "Skills & Pricing" tab first to create work posts.
              </div>
            )}

            {/* Category filter chips */}
            {selectedSkills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPostFilterCategory('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm border transition-colors",
                    postFilterCategory === 'all' ? "border-primary bg-primary/10 text-primary" : "border-border"
                  )}
                >
                  All
                </button>
                {selectedSkills.map(s => {
                  const cat = categories.find(c => c.id === s);
                  return (
                    <button
                      key={s}
                      onClick={() => setPostFilterCategory(s)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm border transition-colors",
                        postFilterCategory === s ? "border-primary bg-primary/10 text-primary" : "border-border"
                      )}
                    >
                      {cat?.icon} {cat?.name}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredPosts.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPosts.map(post => {
                  const cat = categories.find(c => c.id === post.categoryId);
                  return (
                    <div key={post.id} className="card-elevated overflow-hidden group">
                      <div className="aspect-video bg-muted relative">
                        <img
                          src={resolveUploadUrl(post.images[0] || '/placeholder.svg')}
                          alt={post.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 bg-primary/90 text-primary-foreground text-xs rounded-full">
                            {cat?.icon} {cat?.name}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditPost(post)} className="h-7 w-7 rounded-full bg-background/80 flex items-center justify-center hover:bg-background">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDeletePost(post.id)} className="h-7 w-7 rounded-full bg-destructive/80 text-destructive-foreground flex items-center justify-center hover:bg-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <h4 className="font-medium text-sm">{post.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : selectedSkills.length > 0 ? (
              <div className="card-elevated p-12 text-center">
                <Image className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No work posts yet</h3>
                <p className="text-sm text-muted-foreground">Add posts to showcase your work to clients</p>
              </div>
            ) : null}
          </TabsContent>
          {/* ═══ SETTINGS ═══ */}
          <TabsContent value="settings" className="space-y-6">
            {/* Availability */}
            <div className="card-elevated p-6 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Availability
              </h3>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Available for Jobs</p>
                  <p className="text-xs text-muted-foreground">
                    {settings.availability ? 'You will appear in provider recommendations' : 'You are hidden from new job requests'}
                  </p>
                </div>
                <Switch
                  checked={settings.availability}
                  onCheckedChange={(checked) => setSettings(s => ({ ...s, availability: checked }))}
                />
              </div>
            </div>

            {/* Notification Preferences */}
            <div className="card-elevated p-6 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notification Preferences
              </h3>
              <div className="space-y-3">
                {[
                  { key: 'jobRequests' as const, label: 'Job Request Notifications', desc: 'Get notified for new job requests' },
                  { key: 'payments' as const, label: 'Payment Notifications', desc: 'Get notified for payment updates' },
                  { key: 'marketing' as const, label: 'Marketing Notifications', desc: 'Receive promotional offers and tips' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={settings.notifications[item.key]}
                      onCheckedChange={(checked) => setSettings(s => ({
                        ...s,
                        notifications: { ...s.notifications, [item.key]: checked },
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Business Hours */}
            <div className="card-elevated p-6 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Business Hours
              </h3>
              <div className="space-y-2">
                {Object.entries(settings.businessHours).map(([day, hours]) => (
                  <div key={day} className="border-b border-primary/20 pb-3 flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Switch
                      checked={hours.enabled}
                      onCheckedChange={(checked) => setSettings(s => ({
                        ...s,
                        businessHours: { ...s.businessHours, [day]: { ...hours, enabled: checked } },
                      }))}
                    />
                    <span className="w-24 text-sm font-medium">{day}</span>
                    {hours.enabled ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                        <Input
                          type="time"
                          value={hours.open}
                          onChange={e => setSettings(s => ({
                            ...s,
                            businessHours: { ...s.businessHours, [day]: { ...hours, open: e.target.value } },
                          }))}
                          className="w-28 h-8 sm:col-span-0 col-span-1"
                        />
                        <span className="text-muted-foreground sm:ml-6">to</span>
                        <Input
                          type="time"
                          value={hours.close}
                          onChange={e => setSettings(s => ({
                            ...s,
                            businessHours: { ...s.businessHours, [day]: { ...hours, close: e.target.value } },
                          }))}
                          className="w-28 h-8 sm:ml-[-48px]"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card-elevated p-6 space-y-3">
              <h3 className="font-semibold">Review &amp; status</h3>
              {provider?.reviewSubmittedAt && (
                <p className="text-sm text-muted-foreground">
                  Submitted for review:{' '}
                  {new Date(provider.reviewSubmittedAt).toLocaleString()}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSubmitForReview()}
                  disabled={isSaving || !isProfileComplete}
                  title={!isProfileComplete ? 'Complete your profile first' : undefined}
                >
                  Submit for review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await refreshProfile();
                    await loadProvider();
                    toast({ title: 'Status refreshed' });
                  }}
                >
                  Refresh status
                </Button>
              </div>
            </div>

            <Button onClick={async () => {
              if (!user) return;
              setIsSaving(true);
              try {
                const updated = await updateProvider(user.id, { settings });
                setProvider(updated);
                await refreshProfile();
                toast({ title: 'Settings saved', description: 'Your settings have been updated.' });
              } catch {
                toast({ title: 'Error', description: 'Failed to save settings.', variant: 'destructive' });
              } finally {
                setIsSaving(false);
              }
            }} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </TabsContent>

        </Tabs>
      </div>

      <Dialog open={onboardingOpen} onOpenChange={(open) => { if (!open) dismissOnboarding(); else setOnboardingOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Your Profile</DialogTitle>
            <DialogDescription>
              Overview of the sections you need to finish before you can receive jobs.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            To start receiving jobs, you must complete all sections:
          </p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>Profile info</li>
            <li>Skills &amp; Pricing</li>
            <li>Documents</li>
            <li>Work Posts</li>
          </ul>
          <div className="flex justify-end pt-2">
            <Button onClick={dismissOnboarding}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggest a service category</DialogTitle>
            <DialogDescription>
              Request a new category name. An administrator will review your suggestion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="suggest-name">What service should we add?</Label>
            <Input
              id="suggest-name"
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              placeholder="e.g. Pool maintenance"
            />
            <div className="space-y-2">
              <Label htmlFor="suggest-description">Description (optional)</Label>
              <Textarea
                id="suggest-description"
                value={suggestDescription}
                onChange={(e) => setSuggestDescription(e.target.value)}
                placeholder="Short context for the admin reviewer"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSuggestOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSuggestSubmit()} disabled={suggestSubmitting}>
                {suggestSubmitting ? 'Sending…' : 'Submit'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Work Post Modal ═══ */}
      <Dialog open={postModalOpen} onOpenChange={setPostModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPost ? 'Edit Work Post' : 'New Work Post'}</DialogTitle>
            <DialogDescription>
              Add a title, description, category, and photos of your work.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={workPostImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAddWorkPostImage}
          />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Service Category</Label>
              <select
                value={postCategory}
                onChange={(e) => setPostCategory(e.target.value)}
                className="input-field w-full"
              >
                <option value="">Select category</option>
                {selectedSkills.map(s => {
                  const cat = categories.find(c => c.id === s);
                  return <option key={s} value={s}>{cat?.icon} {cat?.name}</option>;
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="e.g. Bathroom tiling project" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={postDescription} onChange={(e) => setPostDescription(e.target.value)} placeholder="Describe the work..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Images</Label>
              <div className="flex flex-wrap gap-2">
                {postImages.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                    <img
                      src={resolveUploadUrl(url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 shadow"
                      onClick={() => setPostImages((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => workPostImageInputRef.current?.click()}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-[10px]">Add</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Upload one or more photos (saved when you create or update the post).</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPostModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSavePost} disabled={!postTitle || !postCategory}>
                {editingPost ? 'Update' : 'Create Post'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
