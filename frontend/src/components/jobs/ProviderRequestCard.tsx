import { ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { getProviderJobPriceDisplay } from '@/lib/jobUtils';
import type { Job } from '@/types';
import { Calendar, ClipboardList, Package, User } from 'lucide-react';

export type ProviderRequestCardVariant = 'pending' | 'rejected' | 'cancelled';

function cancellationLabel(job: Job) {
  if (job.cancellationSource === 'customer_changed_provider') {
    return 'Customer chose another courier';
  }
  return job.cancellationReason || 'Customer cancelled delivery';
}

export function ProviderRequestCard({
  job,
  variant = 'pending',
  onClick,
  actions,
  className,
}: {
  job: Job;
  variant?: ProviderRequestCardVariant;
  onClick?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) return onClick();
    navigate(`/provider/requests/${job.id}`);
  };

  const showRejection = variant === 'rejected';
  const showCancellation = variant === 'cancelled';

  const priceText = useMemo(() => getProviderJobPriceDisplay(job).text, [job]);

  return (
    <div
      className={cn(
        'card-elevated cursor-pointer p-4 transition-shadow hover:shadow-lg sm:p-6',
        className
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:aspect-square sm:h-24 sm:w-24">
          {job.images?.[0] ? (
            <img
              src={resolveUploadUrl(job.images[0])}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{job.categoryName}</h3>
            {job.courierFlow ? (
              <Badge variant="outline" className="text-xs">
                Delivery
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-xs">
              #{job.id.slice(-8)}
            </Badge>
          </div>

          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{job.description}</p>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {job.userName}
            </span>
            {job.courierFlow ? (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" /> Delivery / moving
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" /> {job.materials?.length ?? 0} materials
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {new Date(job.createdAt).toLocaleDateString()}
            </span>
          </div>

          {showRejection && job.rejectionReason && (
            <div className="mt-3 rounded bg-destructive/10 p-2 text-sm">
              <span className="font-medium text-destructive">Reason: </span>
              <span className="text-muted-foreground">
                {job.rejectionReason.replace(/_/g, ' ')}
              </span>
              {job.rejectionDetails && (
                <p className="mt-1 text-xs text-muted-foreground">{job.rejectionDetails}</p>
              )}
            </div>
          )}

          {showCancellation && (
            <div className="mt-3 rounded bg-muted p-2 text-sm">
              <span className="font-medium text-muted-foreground">Cancelled: </span>
              <span>{cancellationLabel(job)}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end sm:text-right">
          <p className="tabular-nums text-lg font-bold text-primary">{priceText}</p>
          {actions ?? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full whitespace-nowrap sm:w-auto"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/provider/requests/${job.id}`);
              }}
            >
              View Details
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

