/* Kara Delik Simülasyonu — service worker (elle yazıldı, bağımlılıksız).
 * - Kurulumda: kabuk (./ ve manifest) + index.html'in başvurduğu hash'li /assets/* dosyaları önbelleğe alınır (çevrimdışı ilk açılış).
 * - Gezinme (HTML): önce ağ, çevrimdışıysa önbellek.  assets/*: önce önbellek (adlar içerik hash'li).  Diğer aynı köken GET: önce ağ, yedek önbellek.
 * - Önbellek adı sürümlüdür; etkinleşmede eski sürümler silinir. Güncelleme: sayfa 'SKIP_WAITING' mesajı gönderince devreye girer.
 * Kapsam göreli: register('./sw.js') → sw.js'in bulunduğu dizin (GitHub Pages alt yolunda da çalışır).
 */
const VERSION = 'v1';
const CACHE = `karadelik-${VERSION}`;
const SCOPE = self.registration.scope; // sonu '/' ile biter
const INDEX = SCOPE;
// Sahne küçük resimleri (tests/ui/make-scenes.mjs üretir; src/ui/scenes.js kimlikleriyle aynı): çevrimdışı da kart şeridinde görünsün.
const SCENES = ['schwarzschild', 'kerr09', 'extreme', 'faceOn', 'tilt17', 'retro', 'close', 'below'].map((id) => `scenes/${id}.webp`);
const SHELL = ['manifest.webmanifest', 'kilavuz.html', 'gizlilik.html', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg', ...SCENES].map((p) => new URL(p, SCOPE).href);

/** index.html metninden aynı kökenli bağımlılık adreslerini çıkarır (script/link/modulepreload). */
function assetUrlsFrom(html) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    let u;
    try { u = new URL(m[1], SCOPE); } catch { continue; }
    if (u.origin === self.location.origin && u.pathname.startsWith(new URL(SCOPE).pathname) && /\/assets\//.test(u.pathname)) out.add(u.href);
  }
  return [...out];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(INDEX, { cache: 'reload' });
    if (!res.ok) throw new Error('index alınamadı');
    const html = await res.clone().text();
    await cache.put(INDEX, res);
    await Promise.all([...assetUrlsFrom(html), ...SHELL].map(async (u) => {
      try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) await cache.put(u, r); } catch { /* ağ yoksa runtime'da dolar */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('karadelik-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/** Yeni index.html'in başvurmadığı eski assets/* girdilerini temizler (önbellek şişmesin). */
async function pruneAssets(cache, html) {
  const keep = new Set(assetUrlsFrom(html));
  for (const req of await cache.keys()) {
    if (/\/assets\//.test(req.url) && !keep.has(req.url)) await cache.delete(req);
  }
}

async function networkFirst(request, { fallbackKey, isIndex } = {}) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(isIndex ? INDEX : request, res.clone());
      if (isIndex) res.clone().text().then((h) => pruneAssets(cache, h)).catch(() => {});
    }
    return res;
  } catch (err) {
    // önce isteğin kendisi (ör. kilavuz.html, gizlilik.html), yoksa kabuk (index) — SPA benzeri çevrimdışı yedek
    const hit = (await cache.match(isIndex ? INDEX : request, { ignoreSearch: true })) || (fallbackKey && await cache.match(fallbackKey, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    // yalnız uygulama kabuğu (kök veya index.html) INDEX girdisine yazılır; kilavuz.html / gizlilik.html kendi adresleriyle önbelleğe alınır
    const isIndex = url.href === INDEX || url.pathname === new URL('index.html', SCOPE).pathname;
    event.respondWith(networkFirst(request, { fallbackKey: INDEX, isIndex }));
  } else if (/\/assets\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname !== new URL('sw.js', SCOPE).pathname) {
    event.respondWith(networkFirst(request));
  }
});
