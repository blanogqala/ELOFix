import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Star, Briefcase, Award, Calendar, Check,
  Image, ExternalLink,
} from 'lucide-react';
import { Category, Provider } from '@/types';
import { getCategories } from '@/lib/api/categories';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { ProviderReputationSummary } from './ProviderReputationSummary';
import { ProviderVerificationBadges } from './ProviderVerificationBadges';
import { RatingBreakdownChart } from './RatingBreakdownChart';
import { ProviderReviewList } from './ProviderReviewList';
import { PortfolioMediaGrid } from './MediaLightbox';
import { hasPortfolioGalleryItems } from '@/lib/portfolioGallery';
import { isNewProvider } from '@/lib/providerReputation';

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
  const navigate = useNavigate();
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

  const categoryName = selectedCategory
    ? categories.find(c => c.id === selectedCategory)?.name || selectedCategory
    : null;

  const workPosts = provider.workPosts || [];
  const hasPortfolioItems = hasPortfolioGalleryItems(workPosts, [], selectedCategory);
  const profileAvatarUrl = resolveUploadUrl(provider.profileImage);
  const breakdown = provider.ratingBreakdown ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const reviewCount = provider.totalReviews ?? provider.reviews?.length ?? 0;
  const isNew = isNewProvider(provider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Provider Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-primary/20 border-2 border-primary flex items-start gap-4">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
              {profileAvatarUrl ? (
                <img src={profileAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-primary">
                  {provider.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold">{provider.name}</h2>
              {provider.businessName && (
                <p className="text-sm text-muted-foreground">{provider.businessName}</p>
              )}
              <p className="text-muted-foreground text-sm mt-1">{provider.bio}</p>
              <div className="mt-2">
                <ProviderReputationSummary provider={provider} size="md" />
              </div>
              <ProviderVerificationBadges provider={provider} className="mt-2" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border-2 border-accent bg-accent/30 rounded-lg">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">
                {new Date(provider.createdAt).getFullYear()}
              </p>
              <p className="text-xs text-muted-foreground">Member since</p>
            </div>
            <div className="text-center p-4 border-2 border-accent bg-accent/30 rounded-lg">
              <Briefcase className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{provider.completedJobs}</p>
              <p className="text-xs text-muted-foreground">Jobs Done</p>
            </div>
            <div className="text-center p-4 border-2 border-accent bg-accent/30 rounded-lg">
              <Star className="h-5 w-5 mx-auto mb-1 text-accent" />
              <p className="text-2xl font-bold">
                {isNew ? '—' : provider.rating.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
          </div>

          {!isNew && reviewCount > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Ratings breakdown</h3>
              <RatingBreakdownChart
                breakdown={breakdown}
                averageRating={provider.rating}
                totalReviews={reviewCount}
              />
            </div>
          )}

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

          <div>
            <h3 className="font-semibold mb-2">
              {categoryName ? `${categoryName} portfolio` : 'Portfolio'}
            </h3>
            <PortfolioMediaGrid
              workPosts={workPosts}
              portfolioImages={[]}
              categoryId={selectedCategory}
            />
            {!hasPortfolioItems && (
              <div className="p-8 text-center bg-muted/50 rounded-lg">
                <Image className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No {categoryName?.toLowerCase() || ''} work posts yet.
                </p>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Customer reviews</h3>
            <ProviderReviewList reviews={provider.reviews?.slice(0, 5) ?? []} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                navigate(`/user/providers/${provider.id}`, {
                  state: selectedCategory ? { selectedCategory } : undefined,
                });
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Full profile
            </Button>
          </div>

          {onSelect && (
            <div className="sticky bottom-0 bg-primary/20 pt-4 border-t border-border -mx-6 px-6 -mb-6 pb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground max-w-md">
                  Labour is quoted after inspection. Choose this provider to continue your request.
                </p>
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
