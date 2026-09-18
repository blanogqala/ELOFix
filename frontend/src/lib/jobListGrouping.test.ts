import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import { groupJobsForList } from '@/lib/jobListGrouping';

function job(over: Partial<Job>): Job {
  return {
    id: 'parent',
    title: 'Tiling',
    category: 'tiling',
    categoryName: 'Tiling',
    description: 'Tiles',
    status: 'IN_PROGRESS',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    userId: 'u1',
    providerId: 'p1',
    ...over,
  } as Job;
}

describe('groupJobsForList', () => {
  it('keeps material-delivery child grouped under the parent job', () => {
    const parent = job({ id: 'svc-1' });
    const child = job({
      id: 'del-1',
      parentJobId: 'svc-1',
      courierFlow: true,
      categoryName: 'Delivery',
      createdAt: '2026-09-02T10:00:00.000Z',
    });
    const entries = groupJobsForList([parent, child]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('group');
    if (entries[0].kind === 'group') {
      expect(entries[0].parent.id).toBe('svc-1');
      expect(entries[0].children.map((c) => c.id)).toEqual(['del-1']);
    }
  });
});
