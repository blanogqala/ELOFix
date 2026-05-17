import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Category, Provider, WorkPost } from '@/types';
import { 
  Star, Clock, Briefcase, Award, Calendar, Check,
  ChevronLeft, ChevronRight, Image
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  formatServiceLaborEstimateDescription,
  formatServiceLaborEstimateShort,
  getServiceLaborEstimate,
} from '@/lib/providerLaborPricing';
import { getCategories } from '@/lib/api/categories';

interface ProviderDetailModalProps {
  provider: Provider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (providerId: string) => void;
  selectedCategory?: string;
}

export function ProviderDetailModal({ 
  provider, open, onOpenChange, onSelect, selectedCategory
}: ProviderDetailModalProps) {
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setCategories(await getCategories());
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  if (!provider) return null;

  const labourEstimate = selectedCategory
    ? getServiceLaborEstimate(provider, selectedCategory)
    : { kind: 'none' as const };
  const categoryName = selectedCategory
    ? categories.find(c => c.id === selectedCategory)?.name || selectedCategory
    : null;

  // Filter work posts by selected category
  const workPosts = (provider.workPosts || []).filter(
    p => !selectedCategory || p.categoryId === selectedCategory
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Provider Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Header */}
          <div className=" p-4 rounded-lg bg-primary/20 border-2 border-primary flex items-start gap-4">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-3xl font-bold text-primary">
                {provider.name.charAt(0)}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{provider.name}</h2>
              {provider.businessName && (
                <p className="text-sm text-muted-foreground">{provider.businessName}</p>
              )}
              <p className="text-muted-foreground text-sm mt-1">{provider.bio}</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-accent text-accent" />
                  <span className="font-medium">{provider.rating.toFixed(1)}</span>
                  <span className="text-muted-foreground text-sm">
                    ({provider.totalReviews ?? provider.reviews?.length ?? 0}{' '}
                    {(provider.totalReviews ?? provider.reviews?.length ?? 0) === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Briefcase className="text-primary h-4 w-4" />
                  {provider.completedJobs} jobs
                </span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="text-primary h-4 w-4" />
                  {provider.responseTime}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border-2 border-accent bg-accent/30 rounded-lg">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{provider.yearsExperience || '5+'}</p>
              <p className="text-xs text-muted-foreground">Years Exp.</p>
            </div>
            <div className="text-center p-4 border-2 border-accent bg-accent/30 rounded-lg">
              <Briefcase className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{provider.completedJobs}</p>
              <p className="text-xs text-muted-foreground">Jobs Done</p>
            </div>
            <div className="text-center p-4 border-2 border-accent bg-accent/30 rounded-lg">
              <Star className="h-5 w-5 mx-auto mb-1 text-accent" />
              <p className="text-2xl font-bold">{provider.rating.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
          </div>

          {/* Certifications */}
          {provider.certifications && provider.certifications.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Certifications</h3>
              <div className="space-y-2 rounded-lg border-2 border-primary p-2 bg-primary/20">
                {provider.certifications.map((cert, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-success" />
                    <span className="text-sm">{cert}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Work Posts (category-filtered) */}
          <div>
            <h3 className="font-semibold mb-2">
              {categoryName ? `${categoryName} Work` : 'Portfolio'}
            </h3>
            {workPosts.length > 0 ? (
              <div className="space-y-4">
                {/* Main gallery from first post */}
                <div className="relative">
                  <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                    <img 
                      src={workPosts[activeGalleryIndex % workPosts.length]?.images[0] || '/placeholder.svg'} 
                      alt="Work sample"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {workPosts.length > 1 && (
                    <>
                      <button
                        onClick={() => setActiveGalleryIndex(prev => 
                          (prev - 1 + workPosts.length) % workPosts.length
                        )}
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setActiveGalleryIndex(prev => 
                          (prev + 1) % workPosts.length
                        )}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Post info */}
                {workPosts[activeGalleryIndex % workPosts.length] && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium text-sm">
                      {workPosts[activeGalleryIndex % workPosts.length].title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {workPosts[activeGalleryIndex % workPosts.length].description}
                    </p>
                  </div>
                )}

                {/* Thumbnails */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {workPosts.map((post, idx) => (
                    <button
                      key={post.id}
                      onClick={() => setActiveGalleryIndex(idx)}
                      className={cn(
                        "h-16 w-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors",
                        idx === activeGalleryIndex % workPosts.length 
                          ? "border-primary" 
                          : "border-transparent hover:border-border"
                      )}
                    >
                      <img src={post.images[0] || '/placeholder.svg'} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : provider.portfolioImages && provider.portfolioImages.length > 0 ? (
              // Fallback to legacy portfolio images
              <div className="grid grid-cols-3 gap-2">
                {provider.portfolioImages.map((img, idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-muted">
                    <img src={img} alt={`Work ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-muted/50 rounded-lg">
                <Image className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No {categoryName?.toLowerCase() || ''} work posts yet.
                </p>
              </div>
            )}
          </div>

          {/* Reviews */}
          {provider.reviews && provider.reviews.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Recent Reviews</h3>
              <div className="space-y-3 rounded-lg border-2 border-primary p-2 bg-primary/20">
                {provider.reviews.slice(0, 3).map(review => (
                  <div key={review.id} className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">{review.userName.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{review.userName}</p>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={cn("h-3 w-3", i < review.rating ? "fill-accent text-accent" : "fill-muted text-muted")} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{review.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing & CTA */}
          {onSelect && (
            <div className="sticky bottom-0 bg-primary/20 pt-4 border-t border-border -mx-6 px-6 -mb-6 pb-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Typical labour (this booking)</p>
                  <p className="text-2xl font-bold text-primary">
                    {selectedCategory ? formatServiceLaborEstimateShort(labourEstimate) : 'Select a category in the wizard'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-[320px]">
                    {selectedCategory
                      ? formatServiceLaborEstimateDescription(labourEstimate)
                      : 'Open this provider from step 4 to see Rand guidance for your chosen service.'}
                  </p>
                  {provider.skills?.includes('delivery') &&
                    provider.settings?.deliveryRatePerKm != null &&
                    Number(provider.settings.deliveryRatePerKm) >= 0 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        Trip / driving guide:{' '}
                        <span className="font-medium">{formatCurrency(provider.settings.deliveryRatePerKm)}</span>/km · final fee uses
                        distance later.
                      </p>
                    )}
                </div>
                <Button className="btn-accent shrink-0" onClick={() => { onSelect(provider.id); onOpenChange(false); }}>
                  <Check className="mr-2 h-4 w-4" />
                  Select Provider
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
