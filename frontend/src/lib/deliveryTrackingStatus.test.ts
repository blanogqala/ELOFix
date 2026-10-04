import { describe, expect, it } from 'vitest';
import {
  isLiveLocationStale,
  liveTrackingHeadline,
  nextLocationHeartbeatMs,
  storeShareStateFromGeolocationError,
  storeShareStatusText,
  usableEtaText,
} from '@/lib/deliveryTrackingStatus';

describe('delivery tracking status', () => {
  it('does not treat a missing or zero duration as an ETA', () => {
    expect(usableEtaText(null, null)).toBeNull();
    expect(usableEtaText('0 sec', 0)).toBeNull();
    expect(usableEtaText('0 sec', null)).toBeNull();
    expect(usableEtaText(undefined, Number.NaN)).toBeNull();
    expect(usableEtaText('12 mins', 720)).toBe('12 mins');
  });

  it('does not refresh the heartbeat when a poll repeats the same coordinate', () => {
    const server = '2020-01-01T00:00:00.000Z';
    const first = nextLocationHeartbeatMs({
      previousLat: null,
      previousLng: null,
      lat: -33.9,
      lng: 18.4,
      serverPingAt: server,
      nowMs: Date.parse('2026-10-04T10:00:00.000Z'),
      fromSocket: false,
    });
    const second = nextLocationHeartbeatMs({
      previousLat: -33.9,
      previousLng: 18.4,
      lat: -33.9,
      lng: 18.4,
      serverPingAt: server,
      nowMs: Date.parse('2026-10-04T10:05:00.000Z'),
      fromSocket: false,
    });
    expect(second).toBe(first);
    expect(second).toBe(Date.parse(server));
    expect(isLiveLocationStale(true, second, Date.parse('2026-10-04T10:05:00.000Z'))).toBe(true);
  });

  it('shows Driver arriving for a fresh fix inside 120m and unavailable when that fix is stale', () => {
    const now = 1_000_000;
    expect(
      liveTrackingHeadline({
        hasDriverFix: true,
        distanceMeters: 40,
        lastPingMs: now - 5_000,
        nowMs: now,
      })
    ).toBe('arriving');
    expect(
      liveTrackingHeadline({
        hasDriverFix: true,
        distanceMeters: 40,
        lastPingMs: now - 31_000,
        nowMs: now,
      })
    ).toBe('unavailable');
    expect(
      liveTrackingHeadline({
        hasDriverFix: true,
        distanceMeters: 800,
        lastPingMs: now - 1_000,
        nowMs: now,
      })
    ).toBe('en_route');
  });

  it('describes geolocation denial instead of hiding it', () => {
    expect(storeShareStateFromGeolocationError(1)).toBe('denied');
    expect(storeShareStatusText('denied')).toMatch(/permission denied/i);
    expect(storeShareStatusText('unavailable')).toMatch(/GPS unavailable/i);
    expect(storeShareStatusText('expired')).toMatch(/expired/i);
    expect(storeShareStatusText('network')).toMatch(/Network failure/i);
    expect(storeShareStatusText('active')).toBe('Sharing active');
  });
});
