import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type SocketHandler = (...args: unknown[]) => void;

const { mockSocket, mockEnsure, mockGetLatest } = vi.hoisted(() => {
  const listeners: Record<string, Set<SocketHandler>> = {};
  const ioListeners: Record<string, Set<SocketHandler>> = {};
  const mockSocket = {
    connected: false,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: SocketHandler) => {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(handler);
    }),
    off: vi.fn((event: string, handler: SocketHandler) => {
      listeners[event]?.delete(handler);
    }),
    io: {
      on: vi.fn((event: string, handler: SocketHandler) => {
        if (!ioListeners[event]) ioListeners[event] = new Set();
        ioListeners[event].add(handler);
      }),
      off: vi.fn((event: string, handler: SocketHandler) => {
        ioListeners[event]?.delete(handler);
      }),
    },
    _listeners: listeners,
    _ioListeners: ioListeners,
  };
  return {
    mockSocket,
    mockEnsure: vi.fn(),
    mockGetLatest: vi.fn(),
  };
});

vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  ensureSocketAuthAndConnect: mockEnsure,
}));

vi.mock('@/lib/api/tracking', () => ({
  getLatestTrackingForOrder: mockGetLatest,
}));

import { useOrderLocationSocket } from '@/hooks/useOrderLocationSocket';

function fire(event: string, payload?: unknown) {
  mockSocket._listeners[event]?.forEach((handler) => handler(payload));
}

function fireIo(event: string, payload?: unknown) {
  mockSocket._ioListeners[event]?.forEach((handler) => handler(payload));
}

describe('useOrderLocationSocket', () => {
  beforeEach(() => {
    mockSocket.connected = false;
    Object.keys(mockSocket._listeners).forEach((k) => mockSocket._listeners[k].clear());
    Object.keys(mockSocket._ioListeners).forEach((k) => mockSocket._ioListeners[k].clear());
    mockSocket.emit.mockClear();
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockEnsure.mockClear();
    mockGetLatest.mockReset();
    mockGetLatest.mockResolvedValue({ lastLat: -26.1, lastLng: 28.1 });
  });

  it('polls HTTP as a fallback and applies coordinates', async () => {
    const { result, unmount } = renderHook(() =>
      useOrderLocationSocket({ orderId: 'order-1', enabled: true }),
    );

    await waitFor(() => {
      expect(result.current.liveLat).toBe(-26.1);
      expect(result.current.liveLng).toBe(28.1);
    });
    expect(mockEnsure).toHaveBeenCalled();
    expect(mockGetLatest).toHaveBeenCalledWith('order-1');
    unmount();
  });

  it('rejoins the order room on reconnect', async () => {
    mockSocket.connected = true;
    const { unmount } = renderHook(() => useOrderLocationSocket({ orderId: 'order-9', enabled: true }));

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('order:join', 'order-9');
    });

    mockSocket.emit.mockClear();
    await act(async () => {
      fireIo('reconnect');
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('order:join', 'order-9');
    unmount();
  });

  it('applies realtime socket updates and removes listeners on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useOrderLocationSocket({ orderId: 'order-2', enabled: true }),
    );

    await waitFor(() => {
      expect(result.current.liveLat).toBe(-26.1);
    });

    await act(async () => {
      fire('order:location:update', { orderId: 'order-2', lat: -26.2, lng: 28.2 });
    });

    expect(result.current.liveLat).toBe(-26.2);
    expect(result.current.liveLng).toBe(28.2);

    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith('order:location:update', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('does not poll when disabled', async () => {
    renderHook(() => useOrderLocationSocket({ orderId: 'order-3', enabled: false }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetLatest).not.toHaveBeenCalled();
  });
});
