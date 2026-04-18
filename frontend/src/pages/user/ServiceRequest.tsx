import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getCategories } from '@/lib/api/categories';
import { getProvidersByCategory, recommendProviders } from '@/lib/api/providers';
import { createJob } from '@/lib/api/jobs';
import { Category, Provider, Measurements, JobLocation } from '@/types';
import { Step2Location } from '@/components/wizard/Step2Location';
import { Step3DynamicInput } from '@/components/wizard/Step3DynamicInput';
import { ProviderDetailModal } from '@/components/providers/ProviderDetailModal';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  Star,
  Clock,
  Briefcase,
  X,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, title: 'Category' },
  { id: 2, title: 'Location' },
  { id: 3, title: 'Details & Requirements' },
  { id: 4, title: 'Provider' },
];

export default function ServiceRequest() {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [location, setLocation] = useState<Partial<JobLocation>>({});
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [measurements, setMeasurements] = useState<Measurements>({ source: 'MANUAL', values: {} });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProviderForModal, setSelectedProviderForModal] = useState<Provider | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentCategory = categories.find((c) => c.id === selectedCategory) as Category | undefined;

  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(data);
      if (!initialCategory && data.length > 0 && !selectedCategory) {
        setSelectedCategory(data[0].id);
      }
    } catch (error) {
      toast({
        title: 'Failed to load categories',
        description: error instanceof Error ? error.message : 'Please refresh and try again.',
        variant: 'destructive',
      });
    }
  }, [initialCategory, selectedCategory, toast]);

  const loadProviders = useCallback(async () => {
    try {
      setProvidersError(null);
      const categoryProviders = await getProvidersByCategory(selectedCategory);
      const recommended = recommendProviders(selectedCategory, categoryProviders, measurements.values);
      setProviders(recommended);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load providers';
      setProviders([]);
      setProvidersError(message);
    }
  }, [measurements.values, selectedCategory]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (selectedCategory && currentStep >= 4) {
      void loadProviders();
    }
  }, [selectedCategory, currentStep, loadProviders]);

  const handleSubmit = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      await createJob(
        {
          category: selectedCategory,
          description,
          images,
          measurements,
          materials: [],
          location:
            location.address && location.city
              ? {
                  address: location.address,
                  city: location.city,
                  area: location.area,
                  suburb: location.suburb,
                  notes: location.notes,
                }
              : undefined,
          selectedProviderId: selectedProvider,
        },
        user.id,
        user.name
      );

      toast({
        title: 'Request Submitted!',
        description: 'Your service request has been submitted successfully.',
      });
      navigate('/user/jobs');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return !!selectedCategory;
      case 2:
        return !!(location.address && location.city);
      case 3: {
        if (description.length <= 10) return false;
        if (!currentCategory) return false;
        if (currentCategory.step3Type === 'measurements') {
          return Object.keys(measurements.values).length > 0;
        }
        if (currentCategory.step3Type === 'items') {
          return (measurements.movingItems?.length || 0) > 0;
        }
        if (currentCategory.step3Type === 'issue') {
          return !!measurements.plumbingIssue?.type;
        }
        return true;
      }
      case 4:
        return !!selectedProvider;
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 ">
            {STEPS.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;

              return (
                <div key={step.id} className="flex items-center">
                  <div
                    className={cn(
                      'wizard-step',
                      isActive && 'wizard-step-active',
                      isCompleted && 'wizard-step-completed',
                      !isActive && !isCompleted && 'wizard-step-pending'
                    )}
                  >
                    <div className="wizard-step-number">{isCompleted ? <Check className="h-4 w-4" /> : step.id}</div>
                    <span className={cn('text-sm hidden sm:inline', isActive ? 'font-medium' : 'text-muted-foreground')}>
                      {step.title}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={cn('w-8 sm:w-16 h-0.5 mx-2', isCompleted ? 'bg-success' : 'bg-border')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-elevated p-6 md:p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">What service do you need?</h2>
                <p className="text-muted-foreground">Select a category that best matches your needs</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={cn('category-card', selectedCategory === category.id && 'selected')}
                  >
                    <div className="text-3xl mb-2">{category.icon}</div>
                    <h3 className="font-medium text-sm">{category.name}</h3>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 2 && <Step2Location location={location} setLocation={setLocation} />}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Job Details & Requirements</h2>
                <p className="text-muted-foreground">Describe your task and provide any relevant details</p>
              </div>

              <div>
                <label htmlFor="description" className="text-sm font-medium">
                  Task Description
                </label>
                <Textarea
                  id="description"
                  placeholder="E.g., I need to tile my bathroom floor. The current tiles are cracked and need replacement..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="textarea-field mt-2"
                  rows={4}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Upload Images (Optional)</label>
                <p className="text-sm text-muted-foreground mb-2">Photos help providers understand your task better</p>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    toast({
                      title: 'Not implemented',
                      description: 'Job image upload endpoint is not implemented in the backend yet.',
                      variant: 'destructive',
                    });
                  }}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Click to upload images</p>
                </div>

                {images.length > 0 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative">
                        <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">Image {idx + 1}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setImages(images.filter((_, i) => i !== idx));
                          }}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {currentCategory && (
                <Step3DynamicInput
                  category={currentCategory}
                  measurements={measurements}
                  setMeasurements={setMeasurements}
                  images={images}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Choose a Provider</h2>
                <p className="text-muted-foreground">Select from our recommended verified providers</p>
                <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Final labor price will be confirmed after provider inspection.</p>
                </div>
              </div>

              <div className="space-y-4">
                {providersError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {providersError}
                  </div>
                ) : providers.length === 0 ? (
                  <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    No providers are available for this category yet.
                  </div>
                ) : providers.map((provider) => (
                  <div
                    key={provider.id}
                    className={cn('provider-card', selectedProvider === provider.id && 'selected')}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 cursor-pointer"
                        onClick={() => setSelectedProviderForModal(provider)}
                      >
                        <span className="text-xl font-bold text-primary">{provider.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3
                            className="font-semibold cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setSelectedProviderForModal(provider)}
                          >
                            {provider.name}
                          </h3>
                          {selectedProvider === provider.id && (
                            <div className="h-5 w-5 rounded-full bg-success flex items-center justify-center">
                              <Check className="h-3 w-3 text-success-foreground" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{provider.bio}</p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-accent text-accent" />
                            {provider.rating.toFixed(1)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Briefcase className="h-4 w-4" />
                            {provider.completedJobs} jobs
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {provider.responseTime}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                        <div>
                          <p className="font-semibold text-lg">${provider.laborPricing[selectedCategory]?.rate || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">
                            per {provider.laborPricing[selectedCategory]?.unit || 'job'} (estimate)
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setSelectedProviderForModal(provider)}>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant={selectedProvider === provider.id ? 'default' : 'outline'}
                            onClick={() => setSelectedProvider(provider.id)}
                          >
                            {selectedProvider === provider.id ? (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Selected
                              </>
                            ) : (
                              'Select'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-border">
            <Button variant="outline" onClick={prevStep} disabled={currentStep === 1}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < 4 ? (
              <Button className="btn-accent" onClick={nextStep} disabled={!canProceed()}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button className="btn-accent" onClick={handleSubmit} disabled={isSubmitting || !canProceed()}>
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <ProviderDetailModal
        provider={selectedProviderForModal}
        open={!!selectedProviderForModal}
        onOpenChange={(open) => !open && setSelectedProviderForModal(null)}
        onSelect={(providerId) => {
          setSelectedProvider(providerId);
          setSelectedProviderForModal(null);
        }}
      />
    </DashboardLayout>
  );
}