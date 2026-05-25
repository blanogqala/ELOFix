import { useNavigate } from 'react-router-dom';
import { Check, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Provider } from '@/types';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { ProviderReputationSummary } from './ProviderReputationSummary';
import { ProviderVerificationBadges } from './ProviderVerificationBadges';

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
  const avatarUrl = resolveUploadUrl(provider.profileImage);

  const openProfile = () => {
    if (onViewProfile) {
      onViewProfile(provider.id);
      return;
    }
    navigate(`/user/providers/${provider.id}`);
  };

  return (
    <div className={cn('provider-card', selected && 'selected')}>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10"
          onClick={openProfile}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-primary">{provider.name.charAt(0)}</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              className="font-semibold text-left hover:text-primary transition-colors"
              onClick={openProfile}
            >
              {provider.name}
            </button>
            {selected && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success">
                <Check className="h-3 w-3 text-success-foreground" />
              </div>
            )}
          </div>
          {provider.businessName && (
            <p className="text-xs text-muted-foreground mb-1">{provider.businessName}</p>
          )}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{provider.bio}</p>
          <ProviderReputationSummary provider={provider} />
          <ProviderVerificationBadges provider={provider} className="mt-2" compact />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
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
  );
}
