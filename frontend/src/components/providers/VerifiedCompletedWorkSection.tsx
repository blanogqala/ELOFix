import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, ShieldCheck } from 'lucide-react';
import { getProviderCompletedProjects } from '@/lib/api/providerPortfolio';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import type { JobCompletionEvidence } from '@/types';

interface VerifiedCompletedWorkSectionProps {
  providerId: string;
  title?: string;
}

export function VerifiedCompletedWorkSection({
  providerId,
  title = 'Verified Completed Work',
}: VerifiedCompletedWorkSectionProps) {
  const [projects, setProjects] = useState<JobCompletionEvidence[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [jobsCompleted, setJobsCompleted] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getProviderCompletedProjects(providerId)
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setAverageRating(data.averageRating);
        setJobsCompleted(data.jobsCompleted);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading verified work...</p>;
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No customer-verified completed projects yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-accent text-accent" />
              {averageRating.toFixed(1)} avg
            </span>
            <span>{jobsCompleted} completed</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {projects.map((p) => (
          <div key={p.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Verified By Customer
              </Badge>
              <span className="text-xs text-muted-foreground">
                {p.jobCategory} · {new Date(p.confirmedAt).toLocaleDateString()}
              </span>
              {p.rating != null && (
                <span className="text-sm flex items-center gap-1 ml-auto">
                  <Star className="h-3 w-3 fill-accent text-accent" />
                  {p.rating}/5
                </span>
              )}
            </div>
            {(p.images.length > 0 || p.videos.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {p.images.map((url) => (
                  <img
                    key={url}
                    src={resolveUploadUrl(url)}
                    alt=""
                    className="h-20 w-20 rounded object-cover"
                  />
                ))}
                {p.videos.map((url) => (
                  <video key={url} src={resolveUploadUrl(url)} className="h-20 w-32 rounded" controls />
                ))}
              </div>
            )}
            {p.review && <p className="text-sm text-muted-foreground">{p.review}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
