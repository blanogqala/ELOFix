import { describe, expect, it, vi } from 'vitest';
import { PRECACHE_REVISION_HEADER, updatePrecache, type PrecacheStore } from './precacheUpdate';

function memoryStore(): PrecacheStore & { bodies: Map<string, string>; revisions: Map<string, string | null> } {
  const responses = new Map<string, Response>();
  return {
    bodies: new Map(),
    revisions: new Map(),
    async match(url) {
      const response = responses.get(url);
      return response ? response.clone() : undefined;
    },
    async put(url, response) {
      const clone = response.clone();
      responses.set(url, response);
      this.bodies.set(url, await clone.text());
      this.revisions.set(url, response.headers.get(PRECACHE_REVISION_HEADER));
    },
  };
}

describe('precache updates for an installed app', () => {
  it('replaces icons, the manifest, and the offline page when their revision changes', async () => {
    const store = memoryStore();
    const installed = {
      '/offline.html': 'offline-v1',
      '/pwa/icon-192.png': 'icon-v1',
      '/pwa/icon-512.png': 'icon-v1',
      '/site.webmanifest': 'manifest-v1',
    };
    await updatePrecache({
      revisions: installed,
      store,
      fetchFresh: async (url) => new Response(`body ${url} v1`, { status: 200 }),
    });

    const fetchFresh = vi.fn(async (url: string) => new Response(`body ${url} v2`, { status: 200 }));
    const updated = await updatePrecache({
      revisions: {
        '/offline.html': 'offline-v2',
        '/pwa/icon-192.png': 'icon-v2',
        '/pwa/icon-512.png': 'icon-v1',
        '/site.webmanifest': 'manifest-v2',
      },
      store,
      fetchFresh,
    });

    expect(updated).toEqual(['/offline.html', '/pwa/icon-192.png', '/site.webmanifest']);
    expect(fetchFresh).toHaveBeenCalledTimes(3);
    expect(fetchFresh).not.toHaveBeenCalledWith('/pwa/icon-512.png');
    expect(store.bodies.get('/offline.html')).toBe('body /offline.html v2');
    expect(store.bodies.get('/pwa/icon-192.png')).toBe('body /pwa/icon-192.png v2');
    expect(store.bodies.get('/site.webmanifest')).toBe('body /site.webmanifest v2');
    expect(store.bodies.get('/pwa/icon-512.png')).toBe('body /pwa/icon-512.png v1');
    expect(store.revisions.get('/offline.html')).toBe('offline-v2');
    expect(store.revisions.get('/site.webmanifest')).toBe('manifest-v2');
  });

  it('keeps the installed copy when a refresh fails', async () => {
    const store = memoryStore();
    await updatePrecache({
      revisions: { '/offline.html': 'offline-v1' },
      store,
      fetchFresh: async () => new Response('offline v1', { status: 200 }),
    });

    const updated = await updatePrecache({
      revisions: { '/offline.html': 'offline-v2' },
      store,
      fetchFresh: async () => {
        throw new Error('offline');
      },
    });

    expect(updated).toEqual([]);
    expect(store.bodies.get('/offline.html')).toBe('offline v1');
    expect(store.revisions.get('/offline.html')).toBe('offline-v1');
  });

  it('refreshes a copy that was stored before revisions existed', async () => {
    const store = memoryStore();
    await store.put('/site.webmanifest', new Response('old manifest', { status: 200 }));

    const updated = await updatePrecache({
      revisions: { '/site.webmanifest': 'manifest-v2' },
      store,
      fetchFresh: async () => new Response('new manifest', { status: 200 }),
    });

    expect(updated).toEqual(['/site.webmanifest']);
    expect(store.bodies.get('/site.webmanifest')).toBe('new manifest');
  });
});
