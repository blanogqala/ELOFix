import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getProviderById, updateProvider } from '@/lib/api/providers';
import { getCategories } from '@/lib/api/categories';
import type { Category, Provider, ProviderSettings } from '@/types';
import { Banknote, X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateSkillPricingDraft } from '@/lib/providerLaborPricing';

const defaultSettings = (): ProviderSettings => ({
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
});

export default function ProviderPricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [pricing, setPricing] = useState<Provider['laborPricing']>({});
  const [settings, setSettings] = useState<ProviderSettings>(defaultSettings());
  const [deliveryKmInput, setDeliveryKmInput] = useState('');

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
      const providerData = await getProviderById(user.id);
      if (providerData) {
        setSelectedSkills(providerData.skills);
        setPricing(providerData.laborPricing);
        const set = providerData.settings || defaultSettings();
        setSettings(set);
        setDeliveryKmInput(
          set.deliveryRatePerKm != null && Number.isFinite(set.deliveryRatePerKm)
            ? String(set.deliveryRatePerKm)
            : ''
        );
      }
    } catch (error) {
      console.error('Failed to load provider:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadProvider();
    }
    void loadCategories();
  }, [user, loadCategories, loadProvider]);

  const handleToggleSkill = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skillId));
      const newPricing = { ...pricing };
      delete newPricing[skillId];
      setPricing(newPricing);
    } else {
      setSelectedSkills([...selectedSkills, skillId]);
      setPricing({ ...pricing, [skillId]: {} });
    }
  };

  const handleSave = async () => {
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
    let deliveryPatch: number | null = null;
    if (deliveryKmInput.trim() === '') {
      deliveryPatch = null;
    } else {
      const pk = Number(deliveryKmInput.trim());
      if (!Number.isFinite(pk) || pk < 0) {
        toast({
          title: 'Invalid delivery rate',
          description: 'Rand per kilometre must be ≥ 0, or leave blank.',
          variant: 'destructive',
        });
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
      });
      setSettings(next.settings || settingsOut);
      setDeliveryKmInput(
        next.settings?.deliveryRatePerKm != null && Number.isFinite(next.settings.deliveryRatePerKm)
          ? String(next.settings.deliveryRatePerKm)
          : ''
      );
      toast({ title: 'Saved', description: 'Skills and ZAR labour guide updated.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save pricing.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
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
      <div className="min-w-0 space-y-6 md:space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Skills & Pricing</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Whole-job labour guide in Rand (customers see this on bookings). The Profile tab has the same editor with full
              onboarding context.
            </p>
          </div>
          <Button className="h-10 w-full shrink-0 whitespace-nowrap sm:w-auto" onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        <div className="card-elevated p-4 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold sm:text-xl">Select Your Services</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleToggleSkill(category.id)}
                className={cn(
                  'rounded-lg border-2 p-4 text-center transition-all',
                  selectedSkills.includes(category.id)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                )}
              >
                <div className="mb-1 text-2xl">{category.icon}</div>
                <p className="text-sm font-medium">{category.name}</p>
              </button>
            ))}
          </div>
        </div>

        {selectedSkills.length > 0 && (
          <div className="card-elevated overflow-hidden">
            <div className="space-y-1 border-b border-border p-4 sm:p-6">
              <h3 className="text-lg font-semibold sm:text-xl">Labour guide (whole job · ZAR)</h3>
              <p className="text-sm text-muted-foreground">
                Lowest and highest labour for comparable jobs. Leave blank if you’re brand new—paid completions will expand the
                range automatically.
              </p>
            </div>

            <div className="divide-y divide-border">
              {selectedSkills.map((skillId) => {
                const category = categories.find((c) => c.id === skillId);
                const sp = pricing[skillId] || {};
                return (
                  <div key={skillId} className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="text-2xl">{category?.icon}</span>
                          <div className="min-w-0">
                            <p className="font-medium">{category?.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{category?.description}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="self-end text-destructive sm:self-auto"
                          type="button"
                          onClick={() => handleToggleSkill(skillId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                            <Banknote className="h-3 w-3" /> Lowest (job)
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
                                [skillId]: { ...prev[skillId], jobFeeLow: raw === '' ? undefined : Number(raw) },
                              }));
                            }}
                            placeholder="Optional"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                            <Banknote className="h-3 w-3" /> Highest (job)
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
                                [skillId]: { ...prev[skillId], jobFeeHigh: raw === '' ? undefined : Number(raw) },
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
          <div className="card-elevated space-y-3 p-4 sm:p-6">
            <h3 className="font-semibold">Driving / delivery (ZAR per km)</h3>
            <p className="text-sm text-muted-foreground">Optional · multiplied by route distance once wired into booking flows.</p>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={deliveryKmInput}
              onChange={(e) => setDeliveryKmInput(e.target.value)}
              placeholder="e.g. 15"
              className="max-w-xs"
            />
          </div>
        )}

        {selectedSkills.length === 0 && (
          <div className="card-elevated p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Banknote className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 font-semibold">No services selected</h3>
            <p className="text-sm text-muted-foreground">Select the trades you cover to declare Rand guidance.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
