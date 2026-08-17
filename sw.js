/**
 * NVP service worker.
 *
 * What has to work offline: the menu, the rules, pass-and-play, and the whole
 * CPU opponent. All of those are pure client-side — the AI runs in the browser,
 * so a plane with no signal is a perfectly good place to play the Ace.
 *
 * What cannot work offline: online rooms. Those are never cached, never served
 * stale, and fail loudly rather than quietly handing back a stale board.
 *
 * Strategies, by request type:
 *   /api/*        network only — a cached game state is a wrong game state
 *   navigations   network first, cached shell as fallback
 *   app assets    cache first, revalidated in the background
 *   fonts         stale-while-revalidate in a separate, longer-lived cache
 */

importScripts('/precache-manifest.js');

const { version, assets } = self.NVP_PRECACHE;

const SHELL_CACHE = `nvp-shell-${version}`;
const FONT_CACHE = 'nvp-fonts-v1';
const KEEP = new Set([SHELL_CACHE, FONT_CACHE]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll is atomic — one 404 would throw away the whole install, so add
    // individually and tolerate a missing optional asset.
    await Promise.all(assets.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch {
        /* skip anything unreachable at install time */
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (KEEP.has(name) ? null : caches.delete(name))));
    await self.clients.claim();
  })());
});

/**
 * The page asks for this when the player taps "Update" — deliberately not
 * automatic, because swapping the worker forces a reload and doing that
 * mid-match would cost someone their turn.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isFont = (url) => url.hostname === 'fonts.googleapis.com'
  || url.hostname === 'fonts.gstatic.com';

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return; // straight to the network

  if (isFont(url)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/'))
          || (await cache.match('/index.html'))
          || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      // Refresh in the background so the next launch is current.
      fetch(request)
        .then((fresh) => { if (fresh && fresh.ok) cache.put(request, fresh); })
        .catch(() => {});
      return cached;
    }
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
