import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, ensureSocketAuthAndConnect } from '@/lib/socket';
import { getLatestTrackingForOrder } from '@/lib/api/tracking';
import { ApiHttpError } from '@/api/client';

const POLL_MS = 10_000;

export function useOrderLocationSocket(opts: { orderId: string | undefined; enabled: boolean }) {
  const { orderId, enabled } = opts;
  const [liveLat, setLiveLat] = useState<number | null>(null);
  const [liveLng, setLiveLng] = useState<number | null>(null);
  const [lastPingAtMs, setLastPingAtMs] = useState<number | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const lastPollRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const orderIdRef = useRef<string | undefined>(undefined);

  orderIdRef.current = orderId;

  const touchPing = useCallback(() => {
    setLastPingAtMs(Date.now());
    setPollFailed(false);
  }, []);

  useEffect(() => {
    if (!orderId || !enabled) return;

    const oid = String(orderId);

    const applyCoords = (la: number, lo: number, fromPoll: boolean) => {
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
      setLiveLat(la);
      setLiveLng(lo);
      touchPing();
      if (fromPoll) {
        lastPollRef.current = { lat: la, lng: lo };
      }
    };

    const onUpdate = (data: { orderId?: string; lat?: number; lng?: number }) => {
      if (String(data?.orderId || '') !== oid) return;
      const la = Number(data?.lat);
      const lo = Number(data?.lng);
      applyCoords(la, lo, false);
    };

    const joinRoom = () => {
      const id = orderIdRef.current;
      if (!id || !enabled) return;
      const cur = String(id);
      socket.emit('order:join', cur);
      socket.emit('join_order', cur);
    };

    ensureSocketAuthAndConnect();
    joinRoom();
    socket.on('order:location:update', onUpdate);
    socket.on('connect', joinRoom);

    const poll = async () => {
      try {
        const loc = await getLatestTrackingForOrder(oid);
        const la = loc.lastLat;
        const lo = loc.lastLng;
        if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
          const prev = lastPollRef.current;
          if (prev.lat === la && prev.lng === lo) {
            touchPing();
          } else {
            applyCoords(la, lo, true);
          }
        }
        setPollFailed(false);
      } catch (e) {
        if (e instanceof ApiHttpError && (e.status === 404 || e.status === 410)) {
          setPollFailed(true);
          return;
        }
        setPollFailed(true);
      }
    };

    void poll();
    const pollId = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      window.clearInterval(pollId);
      socket.off('order:location:update', onUpdate);
      socket.off('connect', joinRoom);
    };
  }, [orderId, enabled, touchPing]);

  return { liveLat, liveLng, lastPingAtMs, pollFailed };
}
