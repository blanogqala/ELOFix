import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSocket } = vi.hoisted(() => {
  const mockSocket = {
    auth: undefined as { token?: string } | Record<string, never> | undefined,
    connected: false,
    active: false,
    connect: vi.fn(function connect(this: { connected: boolean }) {
      this.connected = true;
    }),
    disconnect: vi.fn(function disconnect(this: { connected: boolean }) {
      this.connected = false;
    }),
    io: { on: vi.fn(), off: vi.fn() },
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
  return { mockSocket };
});

vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}));

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

import {
  applyCurrentSocketAuth,
  clearSocketAuthAndDisconnect,
  ensureSocketAuthAndConnect,
  resolveSocketUrl,
  socket,
} from '@/lib/socket';

describe('resolveSocketUrl', () => {
  it('prefers explicit VITE_SOCKET_URL', () => {
    expect(
      resolveSocketUrl({
        prod: true,
        socketUrl: 'https://elofix-api.onrender.com',
        apiBaseUrl: 'https://other.example/api',
      }),
    ).toBe('https://elofix-api.onrender.com');
  });

  it('derives origin from VITE_API_BASE_URL when socket URL is omitted', () => {
    expect(
      resolveSocketUrl({
        prod: true,
        apiBaseUrl: 'https://elofix-api.onrender.com/api',
      }),
    ).toBe('https://elofix-api.onrender.com');
  });

  it('never uses localhost in production', () => {
    expect(
      resolveSocketUrl({
        prod: true,
        socketUrl: 'http://localhost:5000',
        apiBaseUrl: 'http://localhost:5000/api',
      }),
    ).toBe('');
  });

  it('allows localhost in development', () => {
    expect(resolveSocketUrl({ prod: false })).toBe('http://localhost:5000');
  });
});

describe('socket auth lifecycle', () => {
  beforeEach(() => {
    mockSocket.connected = false;
    mockSocket.auth = undefined;
    mockSocket.connect.mockClear();
    mockSocket.disconnect.mockClear();
    mockGetCurrentSession.mockReset();
  });

  it('exports a singleton socket instance', () => {
    expect(socket).toBe(mockSocket);
  });

  it('attaches the current JWT on connect and reconnects when it changes', () => {
    mockGetCurrentSession.mockReturnValue({ token: 'jwt-a' });
    ensureSocketAuthAndConnect();
    expect(mockSocket.auth).toEqual({ token: 'jwt-a' });
    expect(mockSocket.connect).toHaveBeenCalledOnce();

    mockSocket.connected = true;
    mockGetCurrentSession.mockReturnValue({ token: 'jwt-b' });
    ensureSocketAuthAndConnect();
    expect(mockSocket.disconnect).toHaveBeenCalledOnce();
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    expect(mockSocket.auth).toEqual({ token: 'jwt-b' });
  });

  it('clears stale socket auth on logout', () => {
    mockSocket.auth = { token: 'stale-jwt' };
    mockSocket.connected = true;
    mockGetCurrentSession.mockReturnValue(null);
    applyCurrentSocketAuth();
    expect(mockSocket.auth).toEqual({});
    clearSocketAuthAndDisconnect();
    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(mockSocket.connected).toBe(false);
    expect(mockSocket.auth).toEqual({});
  });
});
