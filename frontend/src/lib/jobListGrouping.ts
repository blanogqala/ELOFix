import { Job } from '@/types';

export type JobListEntry =
  | { kind: 'standalone'; job: Job }
  | { kind: 'group'; parent: Job; children: Job[] };

/**
 * Groups material-delivery courier jobs under their parent service job.
 * Operates on an already-filtered list: only jobs present in `jobs` participate.
 */
export function groupJobsForList(jobs: Job[]): JobListEntry[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const childrenByParent = new Map<string, Job[]>();
  const childIds = new Set<string>();

  const linkChild = (parentId: string, child: Job) => {
    if (!byId.has(parentId) || child.id === parentId) return;
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    const list = childrenByParent.get(parentId)!;
    if (!list.some((c) => c.id === child.id)) {
      list.push(child);
      childIds.add(child.id);
    }
  };

  for (const job of jobs) {
    const parentId = job.parentJobId?.trim();
    if (parentId && byId.has(parentId)) {
      linkChild(parentId, job);
    }
  }

  for (const job of jobs) {
    for (const storeOrder of job.storeOrders ?? []) {
      const courierJobId = storeOrder.courierJobId?.trim();
      if (courierJobId && byId.has(courierJobId)) {
        linkChild(job.id, byId.get(courierJobId)!);
      }
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  const parentIdsWithChildren = new Set(childrenByParent.keys());
  const entries: JobListEntry[] = [];

  for (const job of jobs) {
    if (childIds.has(job.id)) continue;
    if (parentIdsWithChildren.has(job.id)) {
      entries.push({
        kind: 'group',
        parent: job,
        children: childrenByParent.get(job.id)!,
      });
    } else {
      entries.push({ kind: 'standalone', job });
    }
  }

  entries.sort((a, b) => {
    const dateA = a.kind === 'group' ? a.parent.createdAt : a.job.createdAt;
    const dateB = b.kind === 'group' ? b.parent.createdAt : b.job.createdAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return entries;
}
