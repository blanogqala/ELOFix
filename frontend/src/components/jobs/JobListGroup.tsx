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

function JobListRow({
  job,
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
        'flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/50',
        isChild && 'border-l-2 border-primary/30 ml-4 sm:ml-6 pl-2'
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
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
          isChild ? 'bg-muted' : 'bg-primary/10'
        )}
      >
        <Icon className={cn('h-6 w-6', isChild ? 'text-muted-foreground' : 'text-primary')} />
      </div>
      {children}
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
