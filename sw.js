// Spider Paint service worker: the app works offline once it has been opened.
// The page, models and icons come from the cache first and are refreshed in the background;
// the engine (pinned to one commit on jsDelivr, so it never changes) and the fonts are kept after the first visit.
const CACHE = 'spider-paint-v108';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'help.md', 'models/bridge.scene.json', 'models/globe.scene.json', 'models/human.scene.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !cdn) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: same });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      // pinned engine and fonts never change: the cache wins; the page and models update behind the scenes
      return hit && !(req.mode === 'navigate') ? hit : fresh.then((r) => r ?? hit);
    }),
  );
});
