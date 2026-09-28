/**
 * EloFix service worker.
 * Navigations are always fetched from the network and are never written to Cache Storage.
 * Only precached icons, the manifest, the offline page, and hashed /assets files are cached.
 * Those stable URLs are refreshed when their content revision changes.
 */
import { CACHE_NAME, isCacheableStaticAsset, isPrecachedAsset, isSensitiveUrl } from './cachePolicy';
import { updatePrecache } from './precacheUpdate';

declare const __ELOFIX_PRECACHE_REVISIONS__: Record<string, string>;

interface WaitUntilEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchWorkerEvent extends WaitUntilEvent {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

const worker = self as unknown as {
  addEventListener(type: string, listener: (event: FetchWorkerEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
  caches: CacheStorage;
};

async function networkNavigation(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cache = await worker.caches.open(CACHE_NAME);
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
    return new Response('You are offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirstStatic(request: Request): Promise<Response> {
  const cache = await worker.caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const url = new URL(request.url);
  if (response.ok && response.type === 'basic' && !url.search) {
    await cache.put(request, response.clone());
  }
  return response;
}

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await worker.caches.open(CACHE_NAME);
      await updatePrecache({
        revisions: __ELOFIX_PRECACHE_REVISIONS__,
        store: {
          match: (url) => cache.match(url),
          put: (url, response) => cache.put(url, response),
        },
        fetchFresh: (url) => fetch(url, { cache: 'reload' }),
      });
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    worker.caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => worker.caches.delete(key))))
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== worker.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkNavigation(request));
    return;
  }

  if (isSensitiveUrl(url)) return;
  if (!isCacheableStaticAsset(url) && !isPrecachedAsset(url)) return;

  event.respondWith(cacheFirstStatic(request));
});
