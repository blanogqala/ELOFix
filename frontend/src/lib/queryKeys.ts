/**
 * TanStack Query keys for jobs. Use `queryKeys.jobs.all` with invalidateQueries
 * to refresh every job-related query after mutations or auth.
 */
export const queryKeys = {
  providerEarnings: {
    job: (id: string) => ['provider-earnings', 'job', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const,
    byUser: (userId: string) => ['jobs', 'byUser', userId] as const,
    byProvider: (providerId: string) => ['jobs', 'byProvider', providerId] as const,
    pendingForProvider: (providerId: string) => ['jobs', 'pending', providerId] as const,
  },
} as const;
