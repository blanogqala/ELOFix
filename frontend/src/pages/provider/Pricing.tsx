import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getProviderById, updateProviderPricing, updateProviderSkills } from '@/lib/api/providers';
import { getCategories } from '@/lib/api/categories';
import { Category, Provider } from '@/types';
import { DollarSign, Plus, X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProviderPricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [pricing, setPricing] = useState<Provider['laborPricing']>({});

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
        setProvider(providerData);
        setSelectedSkills(providerData.skills);
        setPricing(providerData.laborPricing);
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
      setSelectedSkills(selectedSkills.filter(s => s !== skillId));
      const newPricing = { ...pricing };
      delete newPricing[skillId];
      setPricing(newPricing);
    } else {
      setSelectedSkills([...selectedSkills, skillId]);
      setPricing({ ...pricing, [skillId]: { unit: 'hour', rate: 0 } });
    }
  };

  const handleUpdateRate = (skill: string, rate: number) => {
    setPricing({
      ...pricing,
      [skill]: { ...pricing[skill], rate },
    });
  };

  const handleUpdateUnit = (skill: string, unit: 'sqm' | 'hour' | 'job' | 'meter') => {
    setPricing({
      ...pricing,
      [skill]: { ...pricing[skill], unit },
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateProviderSkills(user.id, selectedSkills);
      await updateProviderPricing(user.id, pricing);
      toast({ title: 'Pricing saved', description: 'Your skills and rates have been updated.' });
    } catch (error) {
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
            <p className="text-sm text-muted-foreground sm:text-base">Set your service rates for each skill</p>
          </div>
          <Button className="h-10 w-full shrink-0 whitespace-nowrap sm:w-auto" onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Skill Selection */}
        <div className="card-elevated p-4 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold sm:text-xl">Select Your Services</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleToggleSkill(category.id)}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-center",
                  selectedSkills.includes(category.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="text-2xl mb-1">{category.icon}</div>
                <p className="text-sm font-medium">{category.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Table */}
        {selectedSkills.length > 0 && (
          <div className="card-elevated overflow-hidden">
            <div className="border-b border-border p-4 sm:p-6">
              <h3 className="text-lg font-semibold sm:text-xl">Set Your Rates</h3>
              <p className="text-sm text-muted-foreground">
                Define your pricing for each selected service
              </p>
            </div>

            <div className="divide-y divide-border">
              {selectedSkills.map((skillId) => {
                const category = categories.find(c => c.id === skillId);
                const skillPricing = pricing[skillId] || { unit: 'hour', rate: 0 };

                return (
                  <div key={skillId} className="p-4 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="text-2xl">{category?.icon}</span>
                        <div>
                          <p className="font-medium">{category?.name}</p>
                          <p className="text-xs text-muted-foreground">{category?.description}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <Input
                            type="number"
                            min="0"
                            value={skillPricing.rate || ''}
                            onChange={(e) => handleUpdateRate(skillId, parseFloat(e.target.value) || 0)}
                            className="w-24 min-w-0"
                            placeholder="Rate"
                          />
                        </div>

                        <select
                          value={skillPricing.unit}
                          onChange={(e) => {
                            const unit = e.target.value;
                            if (unit === 'hour' || unit === 'sqm' || unit === 'job' || unit === 'meter') {
                              handleUpdateUnit(skillId, unit);
                            }
                          }}
                          className="input-field min-w-0 w-full max-w-[11rem] sm:w-28"
                        >
                          <option value="hour">per hour</option>
                          <option value="sqm">per sqm</option>
                          <option value="job">per job</option>
                          <option value="meter">per meter</option>
                        </select>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleToggleSkill(skillId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedSkills.length === 0 && (
          <div className="card-elevated p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No services selected</h3>
            <p className="text-muted-foreground text-sm">
              Select the services you offer to set your pricing
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
