import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getProviderById, updateProvider, uploadWorkPostImage } from '@/lib/api/providers';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { compressImageForUpload } from '@/lib/imageCompression';
import { Provider } from '@/types';
import { AlertCircle, Plus, X } from 'lucide-react';
import { ProviderVerificationDocuments } from '@/components/provider/ProviderVerificationDocuments';
import { requiredDocumentsComplete } from '@/lib/providerDocuments';

export default function ProviderDocuments() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const portfolioInputRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);

  const loadProvider = useCallback(async () => {
    if (!user) return;
    try {
      const providerData = await getProviderById(user.id);
      if (providerData) {
        setProvider(providerData);
        setPortfolioImages(providerData.portfolioImages);
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
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      void loadProvider();
    }
  }, [user, loadProvider]);

  const handleProviderUpdated = async (updated: Provider) => {
    setProvider(updated);
    await refreshProfile();
  };

  const handlePortfolioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !provider || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please choose an image under 8 MB.', variant: 'destructive' });
      return;
    }
    try {
      const compressed = await compressImageForUpload(file);
      const url = await uploadWorkPostImage(user.id, compressed);
      const newImages = [...portfolioImages, url];
      const updated = await updateProvider(user.id, { portfolioImages: newImages });
      setProvider(updated);
      setPortfolioImages(newImages);
      await refreshProfile();
      toast({ title: 'Image added', description: 'Portfolio image saved.' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload image.',
        variant: 'destructive',
      });
    }
  };

  const handleRemovePortfolioImage = async (index: number) => {
    if (!user || !provider) return;

    const newImages = portfolioImages.filter((_, i) => i !== index);
    try {
      const updated = await updateProvider(user.id, { portfolioImages: newImages });
      setProvider(updated);
      setPortfolioImages(newImages);
      await refreshProfile();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to remove image.', variant: 'destructive' });
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl md:text-3xl">Documents & Portfolio</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Complete verification documents to build marketplace trust
          </p>
        </div>

        {provider && !provider.approved && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Account pending approval</p>
                <p className="text-sm text-muted-foreground">
                  {requiredDocumentsComplete(provider?.documents)
                    ? 'Required documents uploaded. Complete your profile and submit for admin review.'
                    : 'Upload all required documents, complete your profile, and submit for admin review.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {user && (
          <ProviderVerificationDocuments
            provider={provider}
            userId={user.id}
            onProviderUpdated={handleProviderUpdated}
          />
        )}

        <div className="card-elevated overflow-hidden">
          <div className="border-b border-border p-4 sm:p-6">
            <h3 className="text-lg font-semibold sm:text-xl">Portfolio</h3>
            <p className="text-sm text-muted-foreground">
              Optional — showcase your best work to attract clients
            </p>
          </div>

          <div className="p-4 sm:p-6">
            <input
              ref={portfolioInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePortfolioFile}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {portfolioImages.map((img, index) => (
                <div key={index} className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                  <img
                    src={resolveUploadUrl(img)}
                    alt={`Portfolio ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePortfolioImage(index)}
                    className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => portfolioInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <Plus className="h-8 w-8" />
                <span className="text-sm">Add image</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
