/**
 * TanStack Query keys for all EloFix domains.
 * Use prefix keys (e.g. queryKeys.jobs.all) with invalidateQueries to refresh
 * every query under that domain.  Domain-event realtime sync relies on these keys.
 */
export const queryKeys = {
  materialRequests: {
    /** Provider/customer GET /materials/job/:jobId */
    job: (jobId: string) => ['material-requests', 'job', jobId] as const,
  },
  providerEarnings: {
    all: ['provider-earnings'] as const,
    job: (id: string) => ['provider-earnings', 'job', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const,
    byUser: (userId: string) => ['jobs', 'byUser', userId] as const,
    byProvider: (providerId: string) => ['jobs', 'byProvider', providerId] as const,
    pendingForProvider: (providerId: string) => ['jobs', 'pending', providerId] as const,
  },
  materialOrders: {
    all: ['material-orders'] as const,
    byUser: (userId: string) => ['material-orders', 'user', userId] as const,
  },
  paymentObligations: {
    all: ['payment-obligations'] as const,
    byUser: (userId: string) => ['payment-obligations', 'user', userId] as const,
  },
  disputes: {
    all: ['disputes'] as const,
    detail: (id: string) => ['disputes', id] as const,
  },
  refunds: {
    all: ['refunds'] as const,
    byUser: (userId: string) => ['refunds', 'user', userId] as const,
  },
  notifications: {
    all: (userId: string) => ['notifications', userId] as const,
    list: (userId: string) => ['notifications', 'list', userId] as const,
    unreadCount: (userId: string) => ['notifications', 'unread-count', userId] as const,
  },
  supplier: {
    all: ['supplier'] as const,
    orders: (userId: string) => ['supplier', 'orders', userId] as const,
    profile: (userId: string) => ['supplier', 'profile', userId] as const,
    analyticsOverview: (userId: string) => ['supplier', 'analytics-overview', userId] as const,
    analyticsBranches: ['supplier', 'analytics', 'branches'] as const,
    branches: (userId: string) => ['supplier', 'branches', userId] as const,
  },
  provider: {
    all: ['provider'] as const,
    profile: (userId: string) => ['provider', 'profile', userId] as const,
    pendingRequestIds: (userId: string) => ['provider', 'pending-request-ids', userId] as const,
  },
  admin: {
    all: ['admin'] as const,
    suppliers: ['admin', 'suppliers'] as const,
  },
  profile: {
    current: ['profile', 'current'] as const,
  },
  delivery: {
    all: ['delivery-request-by-job'] as const,
    byJob: (jobId: string) => ['delivery-request-by-job', jobId] as const,
  },
} as const;
