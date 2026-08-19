/**
 * useRealtimeDomainSync
 *
 * Central realtime domain event hook for EloFix.
 * Mount ONCE in the authenticated DashboardLayout — do not duplicate on individual pages.
 *
 * Listens to `domain:update` Socket.IO events emitted by the backend `emitDomainUpdate` helper
 * and maps them to precise React Query cache invalidations so that all affected views
 * refresh automatically without a page reload.
 *
 * SECURITY: Socket events are NOT the source of truth.
 * This hook only uses events as invalidation signals — the frontend always refetches
 * authoritative data from REST endpoints.  Financial amounts and sensitive data are
 * never read from the socket payload.
 */
import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { socket } from '@/lib/socket';
import { queryKeys } from '@/lib/queryKeys';

export interface DomainUpdatePayload {
  domain: string;
  action: string;
  entityId?: string;
  jobId?: string;
  orderId?: string;
  disputeId?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export function useRealtimeDomainSync() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  // ─── Reconnect recovery ──────────────────────────────────────────────────────
  // When the socket reconnects after a temporary disconnection, invalidate critical
  // query prefixes once to recover any events missed during the outage.
  const handleReconnect = useCallback(() => {
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(user.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount(user.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.paymentObligations.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.provider.profile(user.id) });
  }, [queryClient, user?.id]);

  // ─── Domain event handler ─────────────────────────────────────────────────────
  const handleDomainUpdate = useCallback(
    (payload: DomainUpdatePayload) => {
      if (!payload?.domain || !payload?.action) return;

      const { domain, action, jobId, orderId, disputeId } = payload;

      switch (domain) {
        // ── JOB ──────────────────────────────────────────────────────────────
        case 'job': {
          // Always invalidate the job list prefix so every job-list view refreshes.
          void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.job(jobId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.byJob(jobId) });
          }
          break;
        }

        // ── PAYMENT ──────────────────────────────────────────────────────────
        case 'payment': {
          // Invalidate job data so payment state reflects correctly.
          void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
          }
          // Always invalidate payment obligations so any obligation banners/CTAs update.
          void queryClient.invalidateQueries({ queryKey: queryKeys.paymentObligations.all });
          // For restriction-related obligation events, also refresh the profile.
          if (
            action === 'obligation-created' ||
            action === 'obligation-paid' ||
            action === 'obligation-cancelled'
          ) {
            if (user?.id) {
              void queryClient.invalidateQueries({ queryKey: queryKeys.provider.profile(user.id) });
            }
          }
          break;
        }

        // ── DISPUTE ──────────────────────────────────────────────────────────
        case 'dispute': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.all });
          if (disputeId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.disputes.detail(disputeId) });
          }
          void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
          }
          break;
        }

        // ── REFUND ───────────────────────────────────────────────────────────
        case 'refund': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.refunds.all });
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
          }
          break;
        }

        // ── PROFILE (restriction / approval changes) ──────────────────────────
        case 'profile': {
          if (user?.id) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.provider.profile(user.id) });
          }
          if (action === 'restricted' || action === 'unrestricted') {
            // The currently logged-in user's marketplace access may have changed.
            // Refresh the AuthContext so that the restriction banner appears/disappears
            // without requiring logout/login.
            void refreshProfile();
            void queryClient.invalidateQueries({ queryKey: queryKeys.paymentObligations.all });
          }
          if (action === 'updated') {
            // Provider approved/rejected — profile data changed.
            if (user?.id) {
              void queryClient.invalidateQueries({ queryKey: queryKeys.provider.profile(user.id) });
            }
          }
          break;
        }

        // ── MATERIAL ORDER ────────────────────────────────────────────────────
        case 'material-order': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.materialOrders.all });
          if (user?.id) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.materialOrders.byUser(user.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.supplier.orders(user.id) });
          }
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.job(jobId) });
          }
          break;
        }

        // ── DELIVERY ─────────────────────────────────────────────────────────
        case 'delivery': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.all });
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.delivery.byJob(jobId) });
          }
          break;
        }

        // ── EARNINGS ─────────────────────────────────────────────────────────
        case 'earnings': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.providerEarnings.all });
          if (jobId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.providerEarnings.job(jobId) });
          }
          break;
        }

        // ── ADMIN ─────────────────────────────────────────────────────────────
        case 'admin': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
          break;
        }

        // ── NOTIFICATION (supplemental — primary handling in useNotificationSocketSync)
        case 'notification': {
          if (user?.id) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(user.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount(user.id) });
          }
          break;
        }

        // ── SUPPLIER ─────────────────────────────────────────────────────────
        case 'supplier': {
          if (user?.id) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.supplier.all });
          }
          break;
        }

        default:
          // Unknown domain — ignore silently to stay forward-compatible.
          break;
      }
    },
    [queryClient, user?.id, refreshProfile]
  );

  useEffect(() => {
    socket.on('domain:update', handleDomainUpdate);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('domain:update', handleDomainUpdate);
      socket.off('connect', handleReconnect);
    };
  }, [handleDomainUpdate, handleReconnect]);
}
