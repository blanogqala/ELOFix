/**
 * Icons, the manifest, and the offline page keep stable URLs.
 * Content revisions let an already installed service worker replace those
 * files without caching API, job, or payment responses.
 */
export const PRECACHE_REVISION_HEADER = 'x-elofix-precache-revision';

export interface PrecacheStore {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}

export async function updatePrecache(input: {
  revisions: Record<string, string>;
  store: PrecacheStore;
  fetchFresh: (url: string) => Promise<Response>;
}): Promise<string[]> {
  const updated: string[] = [];

  for (const url of Object.keys(input.revisions)) {
    const revision = input.revisions[url];
    const cached = await input.store.match(url);
    if (cached?.headers.get(PRECACHE_REVISION_HEADER) === revision) continue;

    let response: Response;
    try {
      response = await input.fetchFresh(url);
    } catch (error) {
      if (cached) continue;
      throw error;
    }

    if (!response.ok) {
      if (cached) continue;
      throw new Error(`EloFix could not cache ${url}`);
    }

    const headers = new Headers(response.headers);
    headers.set(PRECACHE_REVISION_HEADER, revision);
    const body = await response.arrayBuffer();
    await input.store.put(
      url,
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
    );
    updated.push(url);
  }

  return updated;
}
