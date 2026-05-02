import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '@/lib/socket';
import { queryKeys } from '@/lib/queryKeys';

export interface MaterialOrderFulfillmentPayload {
  orderId?: string;
  jobId?: string | null;
  fulfillmentStatus?: string;
}

/**
 * Real-time refresh when supplier/provider advances fulfillment (Socket.IO).
 * When `watchOrderId` matches the emitted `orderId`, `onWatchOrderFulfillment` runs (e.g. reload Order Details).
 */
export function useMaterialOrderFulfillmentSocket(opts: {
  userId?: string;
  activeJobId?: string;
  watchOrderId?: string;
  onWatchOrderFulfillment?: () => void;
}) {
  const { userId, activeJobId, watchOrderId, onWatchOrderFulfillment } = opts;
  const queryClient = useQueryClient();
  const watchCbRef = useRef<(() => void) | undefined>(undefined);
  watchCbRef.current = onWatchOrderFulfillment;

  useEffect(() => {
    if (!userId) return;
    const handler = (payload: MaterialOrderFulfillmentPayload) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      const jid = payload?.jobId ? String(payload.jobId) : activeJobId;
      if (jid) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(jid) });
      }
      void queryClient.invalidateQueries({ queryKey: ['material-orders', 'user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'orders'] });

      if (
        watchOrderId &&
        payload?.orderId &&
        String(payload.orderId) === String(watchOrderId)
      ) {
        watchCbRef.current?.();
      }
    };
    socket.on('material_order:fulfillment', handler);
    return () => {
      socket.off('material_order:fulfillment', handler);
    };
  }, [userId, activeJobId, watchOrderId, queryClient]);
}
