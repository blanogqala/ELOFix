import { ReactNode } from 'react';
import { Briefcase, Truck } from 'lucide-react';
import { Job } from '@/types';
import { JobListEntry } from '@/lib/jobListGrouping';
import { cn } from '@/lib/utils';

export type JobListRowVariant = 'parent' | 'child';

interface JobListGroupProps {
  entry: JobListEntry;
  onJobClick: (job: Job) => void;
  renderRow: (job: Job, variant: JobListRowVariant) => ReactNode;
  className?: string;
}

/** Shared stacked (mobile) / side-by-side (sm+) body for job list rows. */
export function JobListRowBody({
  primary,
  financial,
  actions,
  className,
}: {
  primary: ReactNode;
  financial?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 max-w-full flex-1 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4',
        className
      )}
    >
      <div className="min-w-0 max-w-full">{primary}</div>
      {financial ? (
        <div className="min-w-0 max-w-full sm:justify-self-end">{financial}</div>
      ) : null}
      {actions ? <div className="min-w-0 max-w-full sm:col-span-2">{actions}</div> : null}
    </div>
  );
}

function JobListRow({
  variant,
  onClick,
  children,
}: {
  job: Job;
  variant: JobListRowVariant;
  onClick: () => void;
  children: ReactNode;
}) {
  const isChild = variant === 'child';
  const Icon = isChild ? Truck : Briefcase;

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'flex min-w-0 max-w-full cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/50 sm:gap-4',
        isChild && 'ml-3 border-l-2 border-primary/30 pl-2 sm:ml-6'
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-12 sm:w-12',
          isChild ? 'bg-muted' : 'bg-primary/10'
        )}
      >
        <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', isChild ? 'text-muted-foreground' : 'text-primary')} />
      </div>
      <div className="flex min-w-0 max-w-full flex-1 items-start gap-3">
        {children}
      </div>
    </div>
  );
}

export function JobListGroup({ entry, onJobClick, renderRow, className }: JobListGroupProps) {
  if (entry.kind === 'standalone') {
    return (
      <div className={className}>
        <JobListRow job={entry.job} variant="parent" onClick={() => onJobClick(entry.job)}>
          {renderRow(entry.job, 'parent')}
        </JobListRow>
      </div>
    );
  }

  return (
    <div className={cn('divide-y divide-border', className)}>
      <JobListRow job={entry.parent} variant="parent" onClick={() => onJobClick(entry.parent)}>
        {renderRow(entry.parent, 'parent')}
      </JobListRow>
      {entry.children.map((child) => (
        <JobListRow key={child.id} job={child} variant="child" onClick={() => onJobClick(child)}>
          {renderRow(child, 'child')}
        </JobListRow>
      ))}
    </div>
  );
}
