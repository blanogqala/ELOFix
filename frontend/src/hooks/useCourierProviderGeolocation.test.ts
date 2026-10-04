import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('@/lib/socket', () => ({
  socket: {
    connected: true,
    emit,
    once: vi.fn(),
  },
  ensureSocketAuthAndConnect: vi.fn(),
}));

import { useCourierProviderGeolocation } from '@/hooks/useCourierProviderGeolocation';

describe('courier geolocation', () => {
  it('still publishes through Socket.IO update_location', async () => {
    emit.mockClear();
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (pos: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: -33.91, longitude: 18.42 } }),
        watchPosition: () => 4,
        clearWatch: () => {},
      },
    });

    const { unmount } = renderHook(() =>
      useCourierProviderGeolocation({ enabled: true, deliveryRequestId: 'delivery-1' })
    );

    await waitFor(() => {
      expect(emit).toHaveBeenCalledWith('update_location', {
        orderId: 'delivery-1',
        lat: -33.91,
        lng: 18.42,
      });
    });
    unmount();
  });
});
