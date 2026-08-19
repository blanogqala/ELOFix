/**
 * Tests for useRealtimeDomainSync
 *
 * Verifies that `domain:update` socket events cause the correct React Query
 * keys to be invalidated, that the hook cleans up listeners on unmount,
 * that duplicate events are idempotent, and that reconnect recovery works.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Mock socket module (use vi.hoisted to avoid TDZ with vi.mock hoisting) ──

const { mockSocket } = vi.hoisted(() => {
  const listeners: Record<string, Set<Function>> = {};
  const sock = {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      listeners[event]?.delete(handler);
    }),
    _listeners: listeners,
  };
  return { mockSocket: sock };
});

vi.mock('@/lib/socket', () => ({ socket: mockSocket }));

// ─── Mock AuthContext ─────────────────────────────────────────────────────────
const { mockRefreshProfile } = vi.hoisted(() => ({
  mockRefreshProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123', role: 'CUSTOMER' },
    refreshProfile: mockRefreshProfile,
  }),
}));

// ─── Helper to fire a socket event ───────────────────────────────────────────
function fireSocketEvent(event: string, payload: unknown) {
  mockSocket._listeners[event]?.forEach((handler) => handler(payload));
}

// ─── Test setup ──────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

import { useRealtimeDomainSync } from '@/hooks/useRealtimeDomainSync';

describe('useRealtimeDomainSync', () => {
  let queryClient: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = makeQueryClient();
    invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    // Reset listener tracking
    Object.keys(mockSocket._listeners).forEach((k) => mockSocket._listeners[k].clear());
    mockRefreshProfile.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: job domain invalidates job keys ────────────────────────────────
  it('invalidates job list and detail on job domain event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'job',
        action: 'status-changed',
        jobId: 'job-abc',
        timestamp: new Date().toISOString(),
      });
    });

    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['jobs']);
    expect(calledKeys).toContainEqual(['jobs', 'detail', 'job-abc']);
    expect(calledKeys).toContainEqual(['material-requests', 'job', 'job-abc']);
    expect(calledKeys).toContainEqual(['delivery-request-by-job', 'job-abc']);
  });

  // ── Test 2: payment domain invalidates payment + job keys ──────────────────
  it('invalidates job and payment-obligations on payment domain event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'payment',
        action: 'paid',
        jobId: 'job-pay',
        timestamp: new Date().toISOString(),
      });
    });

    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['jobs']);
    expect(calledKeys).toContainEqual(['jobs', 'detail', 'job-pay']);
    expect(calledKeys).toContainEqual(['payment-obligations']);
  });

  // ── Test 3: dispute domain invalidates dispute + job keys ──────────────────
  it('invalidates dispute and job keys on dispute domain event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'dispute',
        action: 'resolved',
        jobId: 'job-disp',
        disputeId: 'disp-1',
        timestamp: new Date().toISOString(),
      });
    });

    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['disputes']);
    expect(calledKeys).toContainEqual(['disputes', 'disp-1']);
    expect(calledKeys).toContainEqual(['jobs']);
    expect(calledKeys).toContainEqual(['jobs', 'detail', 'job-disp']);
  });

  // ── Test 4: refund domain invalidates refund + job detail ──────────────────
  it('invalidates refunds and job detail on refund domain event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'refund',
        action: 'updated',
        jobId: 'job-ref',
        timestamp: new Date().toISOString(),
      });
    });

    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['refunds']);
    expect(calledKeys).toContainEqual(['jobs', 'detail', 'job-ref']);
  });

  // ── Test 5: profile:restricted triggers refreshProfile ────────────────────
  it('calls refreshProfile on profile:restricted event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'profile',
        action: 'restricted',
        entityId: 'test-user-123',
        timestamp: new Date().toISOString(),
      });
    });

    expect(mockRefreshProfile).toHaveBeenCalledOnce();
    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['payment-obligations']);
  });

  // ── Test 6: profile:unrestricted triggers refreshProfile ──────────────────
  it('calls refreshProfile on profile:unrestricted event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'profile',
        action: 'unrestricted',
        entityId: 'test-user-123',
        timestamp: new Date().toISOString(),
      });
    });

    expect(mockRefreshProfile).toHaveBeenCalledOnce();
  });

  // ── Test 7: duplicate event is idempotent ──────────────────────────────────
  it('handles duplicate events without error (idempotent invalidations)', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    const payload = {
      domain: 'job',
      action: 'status-changed',
      jobId: 'job-dup',
      timestamp: new Date().toISOString(),
    };

    await act(async () => {
      fireSocketEvent('domain:update', payload);
      fireSocketEvent('domain:update', payload);
      fireSocketEvent('domain:update', payload);
    });

    // Should have invalidated jobs multiple times — but must not throw
    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys.filter((k) => JSON.stringify(k) === JSON.stringify(['jobs'])).length).toBeGreaterThanOrEqual(3);
  });

  // ── Test 8: reconnect recovery invalidates critical prefixes ──────────────
  it('invalidates critical query prefixes on socket reconnect', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('connect', undefined);
    });

    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['jobs']);
    expect(calledKeys).toContainEqual(['notifications', 'list', 'test-user-123']);
    expect(calledKeys).toContainEqual(['payment-obligations']);
  });

  // ── Test 9: listeners are cleaned up on unmount ────────────────────────────
  it('removes socket listeners on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeDomainSync(), {
      wrapper: makeWrapper(queryClient),
    });

    expect(mockSocket.on).toHaveBeenCalledWith('domain:update', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('domain:update', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  // ── Test 10: material-order domain refreshes material orders + job ─────────
  it('invalidates material orders and job on material-order domain event', async () => {
    renderHook(() => useRealtimeDomainSync(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      fireSocketEvent('domain:update', {
        domain: 'material-order',
        action: 'status-changed',
        orderId: 'order-mo',
        jobId: 'job-mo',
        timestamp: new Date().toISOString(),
      });
    });

    const calledKeys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(['material-orders']);
    expect(calledKeys).toContainEqual(['material-orders', 'user', 'test-user-123']);
    expect(calledKeys).toContainEqual(['jobs', 'detail', 'job-mo']);
    expect(calledKeys).toContainEqual(['material-requests', 'job', 'job-mo']);
  });
});
