import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getCategories } from '@/lib/api/categories';
import { getProvidersByCategory, recommendProviders } from '@/lib/api/providers';
import { createJob, uploadJobImage } from '@/lib/api/jobs';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { Category, Provider, Measurements, JobLocation } from '@/types';
import { areaSquareMetersFromAssist } from '@/lib/measurements';
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
import {
  formatServiceLaborEstimateDescription,
  formatServiceLaborEstimateShort,
  getServiceLaborEstimate,
} from '@/lib/providerLaborPricing';

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
  const [useMeasurements, setUseMeasurements] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProviderForModal, setSelectedProviderForModal] = useState<Provider | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentCategory = categories.find((c) => c.id === selectedCategory) as Category | undefined;
  const cameraPrimary =
    currentCategory?.step3Type === 'measurements' && measurements.cameraAssist?.source === 'camera';

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
      const measurementsPayload =
        !useMeasurements
          ? undefined
          : currentCategory?.step3Type === 'issue' && measurements.plumbingIssue
          ? {
              ...measurements,
              plumbingIssue: {
                type: measurements.plumbingIssue.type,
                description: '',
              },
            }
          : measurements;

      await createJob(
        {
          category: selectedCategory,
          description,
          images,
          measurements: measurementsPayload,
          materials: [],
          location:
            location.address && location.city
              ? {
                  address: location.address,
                  city: location.city,
                  area: location.area,
                  suburb: location.suburb,
                  notes: location.notes,
                  ...(location.coordinates ? { coordinates: location.coordinates } : {}),
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
        if (!useMeasurements) return true;
        if (currentCategory.step3Type === 'measurements') {
          const vals = Object.keys(measurements.values).length > 0;
          const camA = measurements.cameraAssist
            ? areaSquareMetersFromAssist(measurements.cameraAssist)
            : undefined;
          const camOk =
            measurements.cameraAssist?.source === 'camera' &&
            camA !== undefined &&
            camA >= 0.5;
          return vals || camOk;
        }
        if (currentCategory.step3Type === 'items') {
          return (measurements.movingItems?.length || 0) > 0;
        }
        if (currentCategory.step3Type === 'issue') {
          return !!measurements.plumbingIssue?.type && description.length > 10;
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
      <div className="mx-auto min-w-0 max-w-4xl animate-fade-in">
        <div className="mb-6 md:mb-8">
          <div className="-mx-1 mb-4 flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto px-1 pb-2 sm:mx-0 sm:justify-between sm:overflow-visible sm:px-0 sm:pb-0">
            {STEPS.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;

              return (
                <div key={step.id} className="flex shrink-0 items-center">
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

        <div className="card-elevated overflow-hidden p-4 sm:p-6 md:p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">What service do you need?</h2>
                <p className="text-muted-foreground">Select a category that best matches your needs</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
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
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const input = e.target;
                    const files = input.files;
                    if (!files?.length) return;
                    setImageUploading(true);
                    try {
                      const urls: string[] = [];
                      for (const file of Array.from(files)) {
                        if (!file.type.startsWith('image/')) continue;
                        urls.push(await uploadJobImage(file));
                      }
                      if (urls.length) {
                        setImages((prev) => [...prev, ...urls]);
                        toast({ title: 'Images uploaded', description: `${urls.length} file(s) added.` });
                      }
                    } catch (err) {
                      toast({
                        title: 'Upload failed',
                        description: err instanceof Error ? err.message : 'Could not upload images.',
                        variant: 'destructive',
                      });
                    } finally {
                      setImageUploading(false);
                      input.value = '';
                    }
                  }}
                />
                <label className="text-sm font-medium">
                  {cameraPrimary ? 'Additional photos (optional)' : 'Upload Images (Optional)'}
                </label>
                <p className="text-sm text-muted-foreground mb-2">
                  {cameraPrimary
                    ? 'Your measurement photo is already included. Add more reference shots if useful.'
                    : 'Photos help providers understand your task better'}
                </p>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && imageInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => !imageUploading && imageInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {imageUploading ? 'Uploading…' : 'Click to upload images'}
                  </p>
                </div>

                {images.length > 0 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {images.map((img, idx) => (
                      <div key={`${img}-${idx}`} className="relative">
                        <div className="h-20 w-20 rounded-lg bg-muted overflow-hidden">
                          <img
                            src={resolveUploadUrl(img)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
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

              <div className="rounded-lg border border-primary bg-primary/10 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={useMeasurements}
                    onChange={(e) => setUseMeasurements(e.target.checked)}
                  />
                  Add measurements or detailed requirements
                </label>
                <p className="mt-1 text-xs font-bold text-accent">
                  Optional for request submission. You can submit now and your provider can add/update measurements after inspection (This can give better understanding of the task).
                </p>
              </div>

              {useMeasurements && currentCategory && (
                <Step3DynamicInput
                  category={currentCategory}
                  measurements={measurements}
                  setMeasurements={setMeasurements}
                  images={images}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  appendImageUrls={async (files, options) => {
                    const urls: string[] = [];
                    for (const file of files) {
                      urls.push(await uploadJobImage(file));
                    }
                    if (urls.length && options?.appendToJobImages !== false) {
                      setImages((prev) => [...prev, ...urls]);
                    }
                    return urls;
                  }}
                  setImages={setImages}
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
                ) : providers.map((provider) => {
                  const est = getServiceLaborEstimate(provider, selectedCategory);
                  const estimatePrimary = formatServiceLaborEstimateShort(est);
                  const estimateHint = formatServiceLaborEstimateDescription(est);
                  return (
                  <div
                    key={provider.id}
                    className={cn('provider-card', selectedProvider === provider.id && 'selected')}
                  >
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                      <div
                        className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/10"
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
                            <span className="text-muted-foreground text-xs">
                              ({provider.totalReviews ?? provider.reviews?.length ?? 0})
                            </span>
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
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end sm:text-right">
                        <div>
                          <p className="text-sm font-semibold text-primary">{estimatePrimary}</p>
                          <p className="text-xs text-muted-foreground max-w-[220px] sm:max-w-xs sm:text-right leading-snug">{estimateHint}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button size="sm" variant="outline" className="w-full whitespace-nowrap sm:w-auto" onClick={() => setSelectedProviderForModal(provider)}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            className="w-full whitespace-nowrap sm:w-auto"
                            variant={selectedProvider === provider.id ? 'default' : 'outline'}
                            onClick={() => setSelectedProvider(provider.id)}
                          >
                            {selectedProvider === provider.id ? (
                              <>
                                <Check className="mr-1 h-4 w-4" />
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
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" className="w-full sm:w-auto" onClick={prevStep} disabled={currentStep === 1}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < 4 ? (
              <Button className="btn-accent h-10 w-full whitespace-nowrap sm:w-auto" onClick={nextStep} disabled={!canProceed()}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button className="btn-accent h-10 w-full whitespace-nowrap sm:w-auto" onClick={handleSubmit} disabled={isSubmitting || !canProceed()}>
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
        selectedCategory={selectedCategory || undefined}
        onSelect={(providerId) => {
          setSelectedProvider(providerId);
          setSelectedProviderForModal(null);
        }}
      />
    </DashboardLayout>
  );
}