import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, ChevronLeft, ChevronRight, Image, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProviderById } from '@/lib/api/providers';
import { getProviderReviews } from '@/lib/api/providerReviews';
import type { Provider, ProviderRatingBreakdown, ProviderReview } from '@/types';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { ProviderReputationSummary } from '@/components/providers/ProviderReputationSummary';
import { ProviderVerificationBadges } from '@/components/providers/ProviderVerificationBadges';
import { RatingBreakdownChart } from '@/components/providers/RatingBreakdownChart';
import { ProviderReviewList } from '@/components/providers/ProviderReviewList';
import { isNewProvider } from '@/lib/providerReputation';

const emptyBreakdown = (): ProviderRatingBreakdown => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

type ProviderProfileLocationState = {
  fromServiceRequest?: boolean;
};

export default function UserProviderProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromServiceRequest = (location.state as ProviderProfileLocationState | null)?.fromServiceRequest;
  const [provider, setProvider] = useState<Provider | null>(null);
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [breakdown, setBreakdown] = useState<ProviderRatingBreakdown>(emptyBreakdown());
  const [completedJobs, setCompletedJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getProviderById(id)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setError('Provider not found');
          setProvider(null);
        } else {
          setProvider(p);
          if (p.ratingBreakdown) setBreakdown(p.ratingBreakdown);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load provider');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setReviewsLoading(true);
    void getProviderReviews(id, { limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setReviews(res.reviews);
        setBreakdown(res.ratingBreakdown);
        setCompletedJobs(res.completedJobs);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const workPosts = provider?.workPosts ?? [];
  const portfolioFallback = provider?.portfolioImages ?? [];
  const isNew = provider ? isNewProvider(provider) : false;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-8">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (fromServiceRequest) {
              navigate('/user/request/service');
              return;
            }
            navigate(-1);
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !provider ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {error || 'Provider not found'}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-2 border-primary/30">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                    {resolveUploadUrl(provider.profileImage) ? (
                      <img
                        src={resolveUploadUrl(provider.profileImage)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-bold text-primary">{provider.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-bold">{provider.name}</h1>
                    {provider.businessName && (
                      <p className="text-muted-foreground">{provider.businessName}</p>
                    )}
                    {provider.bio && <p className="mt-2 text-sm">{provider.bio}</p>}
                    <div className="mt-3">
                      <ProviderReputationSummary provider={provider} size="md" />
                    </div>
                    <ProviderVerificationBadges provider={provider} className="mt-3" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    Completed jobs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tabular-nums">
                    {(completedJobs || provider.completedJobs).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Successfully finished on EloFix
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Trust & verification</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProviderVerificationBadges provider={provider} />
                </CardContent>
              </Card>
            </div>

            {!isNew && (provider.totalReviews ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Ratings breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <RatingBreakdownChart
                    breakdown={breakdown}
                    averageRating={provider.rating}
                    totalReviews={provider.totalReviews ?? reviews.length}
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                {workPosts.length > 0 ? (
                  <div className="space-y-4">
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                      <img
                        src={
                          resolveUploadUrl(workPosts[galleryIndex % workPosts.length]?.images[0]) ||
                          '/placeholder.svg'
                        }
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {workPosts.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
                            onClick={() =>
                              setGalleryIndex((i) => (i - 1 + workPosts.length) % workPosts.length)
                            }
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
                            onClick={() => setGalleryIndex((i) => (i + 1) % workPosts.length)}
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                    <p className="font-medium">{workPosts[galleryIndex % workPosts.length]?.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {workPosts[galleryIndex % workPosts.length]?.description}
                    </p>
                  </div>
                ) : portfolioFallback.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {portfolioFallback.map((src, idx) => (
                      <div key={idx} className="aspect-square overflow-hidden rounded-lg bg-muted">
                        <img
                          src={resolveUploadUrl(src) || '/placeholder.svg'}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-muted-foreground">
                    <Image className="mx-auto h-8 w-8 mb-2 opacity-60" />
                    <p className="text-sm">No portfolio items yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer reviews</CardTitle>
              </CardHeader>
              <CardContent>
                <ProviderReviewList reviews={reviews} loading={reviewsLoading} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
