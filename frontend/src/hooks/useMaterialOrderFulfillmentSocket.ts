import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '@/lib/socket';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Real-time refresh when supplier advances fulfillment (Socket.IO).
 * Firebase Auth is used for login only; material batch data lives in Postgres and syncs via this channel.
 */
export function useMaterialOrderFulfillmentSocket(opts: { userId?: string; activeJobId?: string }) {
  const { userId, activeJobId } = opts;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const handler = (payload: { jobId?: string | null }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      const jid = payload?.jobId ? String(payload.jobId) : activeJobId;
      if (jid) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jid) });
      }
      void queryClient.invalidateQueries({ queryKey: ['material-orders', 'user', userId] });
    };
    socket.on('material_order:fulfillment', handler);
    return () => {
      socket.off('material_order:fulfillment', handler);
    };
  }, [userId, activeJobId, queryClient]);
}
