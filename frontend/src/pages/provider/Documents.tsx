import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getProviderById, updateProvider, uploadProviderDocument, uploadWorkPostImage } from '@/lib/api/providers';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { compressImageForUpload } from '@/lib/imageCompression';
import { Provider } from '@/types';
import { 
  Upload, 
  FileCheck, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  X,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DocType = 'idDoc' | 'companyReg' | 'proofOfSkill';

const documentTypes: { id: DocType; label: string; description: string; required: boolean }[] = [
  { id: 'idDoc', label: 'ID Document', description: 'Government-issued photo ID', required: true },
  { id: 'companyReg', label: 'Company Registration', description: 'Business license or registration', required: false },
  { id: 'proofOfSkill', label: 'Proof of Skill', description: 'Certifications or qualifications', required: true },
];

export default function ProviderDocuments() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const docInputRefs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({});
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

  const triggerDocUpload = (docType: DocType) => {
    docInputRefs.current[docType]?.click();
  };

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>, docType: DocType) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !provider) return;
    try {
      const uploadFile = file.type.startsWith('image/') ? await compressImageForUpload(file) : file;
      const updated = await uploadProviderDocument(user.id, docType, uploadFile);
      setProvider(updated);
      await refreshProfile();
      toast({ title: 'Document uploaded', description: 'Pending admin review.' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload document.',
        variant: 'destructive',
      });
    }
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

  const getDocStatus = (docType: DocType) => {
    const doc = provider?.documents[docType];
    if (!doc) return null;

    switch (doc.status) {
      case 'approved':
        return { icon: CheckCircle, label: 'Approved', class: 'text-success' };
      case 'rejected':
        return { icon: AlertCircle, label: 'Rejected', class: 'text-destructive' };
      case 'pending':
      default:
        return { icon: Clock, label: 'Pending', class: 'text-warning' };
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
          <p className="text-sm text-muted-foreground sm:text-base">Upload required documents for verification</p>
        </div>

        {/* Approval Status */}
        {provider && !provider.approved && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Account Pending Approval</p>
                <p className="text-sm text-muted-foreground">
                  Upload all required documents and complete your profile for admin review.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Required Documents */}
        <div className="card-elevated overflow-hidden">
          <div className="border-b border-border p-4 sm:p-6">
            <h3 className="text-lg font-semibold sm:text-xl">Verification Documents</h3>
            <p className="text-sm text-muted-foreground">Upload documents for identity verification</p>
          </div>

          <div className="divide-y divide-border">
            {documentTypes.map((docType) => {
              const doc = provider?.documents[docType.id];
              const status = getDocStatus(docType.id);
              const StatusIcon = status?.icon;

              return (
                <div key={docType.id} className="p-4 sm:p-6">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    ref={(el) => {
                      docInputRefs.current[docType.id] = el;
                    }}
                    onChange={(e) => void handleDocFileChange(e, docType.id)}
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{docType.label}</p>
                        {docType.required && (
                          <span className="text-xs text-destructive">Required</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{docType.description}</p>
                      
                      {doc?.status === 'rejected' && doc.feedback && (
                        <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                          Feedback: {doc.feedback}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      {status && StatusIcon && (
                        <div className={cn("flex items-center gap-1", status.class)}>
                          <StatusIcon className="h-4 w-4" />
                          <span className="text-sm font-medium">{status.label}</span>
                        </div>
                      )}
                      
                      {(!doc || doc.status === 'rejected') && (
                        <Button type="button" size="sm" className="h-9 w-full whitespace-nowrap sm:w-auto" onClick={() => triggerDocUpload(docType.id)}>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload
                        </Button>
                      )}
                      
                      {doc && doc.status !== 'rejected' && (
                        <Button type="button" size="sm" variant="outline" className="h-9 w-full whitespace-nowrap sm:w-auto" onClick={() => triggerDocUpload(docType.id)}>
                          Replace
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Portfolio */}
        <div className="card-elevated overflow-hidden">
          <div className="border-b border-border p-4 sm:p-6">
            <h3 className="text-lg font-semibold sm:text-xl">Portfolio</h3>
            <p className="text-sm text-muted-foreground">
              Showcase your best work to attract clients
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
                <span className="text-sm">Add Image</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
