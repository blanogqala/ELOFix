import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, ensureSocketAuthAndConnect } from '@/lib/socket';
import { getLatestTrackingForOrder } from '@/lib/api/tracking';
import { ApiHttpError } from '@/api/client';

const POLL_MS = 10_000;
/** Faster poll until the first driver ping so COLLECTING maps populate quickly. */
const POLL_MS_UNTIL_FIRST_FIX = 2_500;

export function useOrderLocationSocket(opts: { orderId: string | undefined; enabled: boolean }) {
  const { orderId, enabled } = opts;
  const [liveLat, setLiveLat] = useState<number | null>(null);
  const [liveLng, setLiveLng] = useState<number | null>(null);
  const [lastPingAtMs, setLastPingAtMs] = useState<number | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [isSocketReconnecting, setIsSocketReconnecting] = useState(false);
  const lastPollRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const orderIdRef = useRef<string | undefined>(undefined);
  const hadConnectedRef = useRef(false);
  const hasFixRef = useRef(false);
  const pollIntervalRef = useRef<number | null>(null);

  orderIdRef.current = orderId;

  const touchPing = useCallback(() => {
    setLastPingAtMs(Date.now());
    setPollFailed(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsSocketReconnecting(false);
      return;
    }

    if (!orderId) {
      setIsSocketReconnecting(false);
      return;
    }

    hadConnectedRef.current = false;
    hasFixRef.current = false;
    const oid = String(orderId);

    setLiveLat(null);
    setLiveLng(null);
    setLastPingAtMs(null);
    lastPollRef.current = { lat: null, lng: null };

    const applyCoords = (la: number, lo: number, fromPoll: boolean) => {
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
      setLiveLat(la);
      setLiveLng(lo);
      touchPing();
      const becameFirstFix = !hasFixRef.current;
      if (becameFirstFix) {
        hasFixRef.current = true;
      }
      if (fromPoll) {
        lastPollRef.current = { lat: la, lng: lo };
      }
      if (becameFirstFix && pollIntervalRef.current != null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = window.setInterval(() => {
          void runPoll();
        }, POLL_MS);
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
      socket.emit('order:join', String(id));
    };

    const onConnect = () => {
      hadConnectedRef.current = true;
      setIsSocketReconnecting(false);
      joinRoom();
    };

    const onDisconnect = () => {
      if (hadConnectedRef.current) setIsSocketReconnecting(true);
    };

    const onConnectError = () => {
      if (hadConnectedRef.current) setIsSocketReconnecting(true);
    };

    const onReconnect = () => {
      joinRoom();
      setIsSocketReconnecting(false);
    };

    ensureSocketAuthAndConnect();

    socket.off('order:location:update', onUpdate);
    socket.on('order:location:update', onUpdate);
    socket.off('connect', onConnect);
    socket.on('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.on('disconnect', onDisconnect);
    socket.off('connect_error', onConnectError);
    socket.on('connect_error', onConnectError);

    const ioMgr = socket.io;
    ioMgr.off('reconnect', onReconnect);
    ioMgr.on('reconnect', onReconnect);

    if (socket.connected) {
      hadConnectedRef.current = true;
    }
    joinRoom();

    async function runPoll() {
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
    }

    void runPoll();
    pollIntervalRef.current = window.setInterval(() => {
      void runPoll();
    }, POLL_MS_UNTIL_FIRST_FIX);

    return () => {
      if (pollIntervalRef.current != null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      socket.off('order:location:update', onUpdate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      ioMgr.off('reconnect', onReconnect);
    };
  }, [orderId, enabled, touchPing]);

  return { liveLat, liveLng, lastPingAtMs, pollFailed, isSocketReconnecting };
}
