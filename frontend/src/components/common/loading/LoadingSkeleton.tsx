import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function LoadingSkeletonRoot({
  children,
  className,
  label = 'Loading content',
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn(className)} aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function repeat(count: number, render: (index: number) => React.ReactNode) {
  return Array.from({ length: count }, (_, index) => render(index));
}

export function DashboardStatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <LoadingSkeletonRoot>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {repeat(count, (index) => (
          <div key={index} className="card-elevated space-y-3 p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </LoadingSkeletonRoot>
  );
}

export function JobCardSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-4', className)}>
      {repeat(count, (index) => (
        <div key={index} className="flex items-center gap-4 p-2">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="hidden shrink-0 space-y-2 text-right sm:block">
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        </div>
      ))}
    </LoadingSkeletonRoot>
  );
}

export function ProviderCardSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-4', className)}>
      {repeat(count, (index) => (
        <div key={index} className="card-elevated space-y-4 p-4">
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </LoadingSkeletonRoot>
  );
}

export function MaterialOrderCardSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-4', className)}>
      {repeat(count, (index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border border-border p-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="hidden h-4 w-16 sm:block" />
        </div>
      ))}
    </LoadingSkeletonRoot>
  );
}

export function NotificationSkeleton({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-3', className)}>
      {repeat(count, (index) => (
        <div key={index} className="flex items-start gap-3 rounded-lg border border-border p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 max-w-xs" />
            <Skeleton className="h-3 w-full max-w-sm" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </LoadingSkeletonRoot>
  );
}

export function ProductCardSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <LoadingSkeletonRoot className={className}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {repeat(count, (index) => (
          <div key={index} className="card-elevated space-y-3 overflow-hidden">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </LoadingSkeletonRoot>
  );
}

export function JobDetailPageSkeleton({ className }: { className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-6', className)} label="Loading job details">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="card-elevated space-y-4 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-2/3 max-w-md" />
      </div>
      <div className="card-elevated space-y-4 p-6">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      </div>
      <div className="card-elevated space-y-4 p-6">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-40" />
      </div>
    </LoadingSkeletonRoot>
  );
}

export function MaterialOrderDetailSkeleton({ className }: { className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-6', className)} label="Loading order details">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="card-elevated space-y-4 p-6">
        <Skeleton className="h-6 w-32 rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-2 flex-1 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="card-elevated space-y-3 p-6">
        <Skeleton className="h-5 w-28" />
        <JobCardSkeleton count={2} />
      </div>
    </LoadingSkeletonRoot>
  );
}

export function ProviderProfileSkeleton({ className }: { className?: string }) {
  return (
    <LoadingSkeletonRoot className={cn('space-y-6', className)} label="Loading provider profile">
      <div className="card-elevated space-y-6 p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
          <div className="w-full space-y-3 text-center sm:text-left">
            <Skeleton className="mx-auto h-7 w-48 sm:mx-0" />
            <Skeleton className="mx-auto h-4 w-64 sm:mx-0" />
            <div className="flex justify-center gap-2 sm:justify-start">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-b border-border pb-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
      <ProviderCardSkeleton count={1} />
    </LoadingSkeletonRoot>
  );
}

export { Skeleton as LoadingSkeletonPrimitive };
