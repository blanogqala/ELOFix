import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProviderDiscoveryCard } from '@/components/providers/ProviderDiscoveryCard';
import { getProvidersByCategory, recommendProviders } from '@/lib/api/providers';
import type { Job, Provider } from '@/types';

interface RejectedJobProviderSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  loading?: boolean;
  onConfirm: (selectedProviderId: string) => Promise<void>;
}

function excludeRejectedProviders(job: Job, providers: Provider[]): Provider[] {
  const excludeIds = new Set(
    [job.providerId, job.rejectedByProviderUserId].filter(Boolean).map((id) => String(id))
  );
  return providers.filter(
    (provider) =>
      !excludeIds.has(String(provider.id)) &&
      !(provider.profileId && excludeIds.has(String(provider.profileId)))
  );
}

export function RejectedJobProviderSelectorDialog({
  open,
  onOpenChange,
  job,
  loading = false,
  onConfirm,
}: RejectedJobProviderSelectorDialogProps) {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const categoryProviders = await getProvidersByCategory(job.category, job.location);
      const recommended = recommendProviders(
        job.category,
        categoryProviders,
        job.measurements?.values || {}
      );
      setProviders(excludeRejectedProviders(job, recommended));
    } catch (error) {
      setProviders([]);
      setProvidersError(
        error instanceof Error ? error.message : 'Failed to load providers. Please try again.'
      );
    } finally {
      setProvidersLoading(false);
    }
  }, [job]);

  useEffect(() => {
    if (!open) {
      setSelectedProvider('');
      return;
    }
    void loadProviders();
  }, [open, loadProviders]);

  const handleConfirm = async () => {
    if (!selectedProvider) return;
    await onConfirm(selectedProvider);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose another provider</DialogTitle>
          <DialogDescription>
            Compare verified providers by ratings, completed jobs, and portfolio — not estimated
            prices. Labour is quoted after inspection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {providersLoading ? (
            <p className="text-sm text-muted-foreground">Loading providers…</p>
          ) : providersError ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{providersError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadProviders()}>
                Try again
              </Button>
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other providers are available for this category and location right now.
            </p>
          ) : (
            <div className="space-y-4">
              {providers.map((provider) => (
                <ProviderDiscoveryCard
                  key={provider.id}
                  provider={provider}
                  selected={selectedProvider === provider.id}
                  onSelect={setSelectedProvider}
                  onViewProfile={(providerId) =>
                    navigate(`/user/providers/${providerId}`, { state: { fromJobDetail: true } })
                  }
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            className="btn-accent"
            disabled={!selectedProvider || loading || providersLoading}
            onClick={() => void handleConfirm()}
          >
            {loading ? 'Sending request…' : 'Send to selected provider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
