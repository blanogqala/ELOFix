import { useNavigate } from 'react-router-dom';
import { Check, Eye, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Provider } from '@/types';
import { formatReviewCount, isNewProvider } from '@/lib/providerReputation';
import { ProviderReputationSummary } from './ProviderReputationSummary';
import { ProviderVerificationBadges } from './ProviderVerificationBadges';
import { ProfileAvatar } from '@/components/common/ProfileAvatar';

interface ProviderDiscoveryCardProps {
  provider: Provider;
  selected?: boolean;
  onSelect: (providerId: string) => void;
  onViewProfile?: (providerId: string) => void;
}

export function ProviderDiscoveryCard({
  provider,
  selected,
  onSelect,
  onViewProfile,
}: ProviderDiscoveryCardProps) {
  const navigate = useNavigate();

  const openProfile = () => {
    if (onViewProfile) {
      onViewProfile(provider.id);
      return;
    }
    navigate(`/user/providers/${provider.id}`);
  };

  const reviewCount = provider.totalReviews ?? provider.reviews?.length ?? 0;
  const isNew = isNewProvider(provider);

  const overallRating = (
    <div className="text-right text-sm">
      {isNew ? (
        <div className="flex flex-col gap-0.5 sm:items-end">
          <span className="font-semibold text-primary">New Provider</span>
          <span className="text-xs text-muted-foreground italic">No ratings yet</span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Star className="h-4 w-4 fill-accent text-accent shrink-0" aria-hidden />
          <span className="font-semibold">{provider.rating.toFixed(1)}</span>
          <span className="text-muted-foreground">· {formatReviewCount(reviewCount)}</span>
        </span>
      )}
    </div>
  );

  return (
    <div className={cn('provider-card', selected && 'selected')}>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <button
            type="button"
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={openProfile}
          >
            <ProfileAvatar
              name={provider.name}
              imageUrl={provider.profileImage}
              className="h-14 w-14"
              fallbackClassName="text-xl font-bold"
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="font-semibold text-left hover:text-primary transition-colors"
                  onClick={openProfile}
                >
                  {provider.name}
                </button>
                {selected && (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success">
                    <Check className="h-3 w-3 text-success-foreground" />
                  </div>
                )}
              </div>
              <div className="shrink-0 sm:hidden">{overallRating}</div>
            </div>
            {provider.businessName && (
              <p className="text-xs text-muted-foreground mb-1">{provider.businessName}</p>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{provider.bio}</p>
            <ProviderReputationSummary provider={provider} showRating={false} />
            <ProviderVerificationBadges provider={provider} className="mt-2" compact />
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="hidden sm:block">{overallRating}</div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            <Button
              size="sm"
              variant="outline"
              className="w-full whitespace-nowrap sm:w-auto"
              onClick={openProfile}
            >
              <Eye className="mr-1 h-4 w-4" />
              View profile
            </Button>
            <Button
              size="sm"
              className="w-full whitespace-nowrap sm:w-auto"
              variant={selected ? 'default' : 'outline'}
              onClick={() => onSelect(provider.id)}
            >
              {selected ? (
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
}
