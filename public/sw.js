// Gallery Crypto オフライン検証アプリ用。/verify と検証に必要なものだけを保存し、他のページには関与しない。
const C = 'gc-verify-v2';
const PRE = ['/verify', '/api/keyring', '/manifest.webmanifest', '/gc-verify.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(C).then((c) => Promise.all(PRE.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// ページが読み込んだ部品（JS・CSS・フォント）を保存してもらう
self.addEventListener('message', (e) => {
  const urls = (e.data && e.data.cache) || [];
  e.waitUntil(caches.open(C).then((c) => Promise.all(urls.filter((u) => new URL(u).origin === location.origin).map((u) => c.add(u).catch(() => {})))));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const p = u.pathname;
  const page = p === '/verify';
  const asset = p.startsWith('/_next/static/') || p === '/gc-verify.svg';
  const data = p === '/api/keyring' || p.startsWith('/api/passport/') || p === '/.well-known/gc-issuer.json' || p === '/manifest.webmanifest';
  if (!(page || asset || data)) return;
  if (asset) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const cl = res.clone(); caches.open(C).then((c) => c.put(e.request, cl)); return res; })));
    return;
  }
  const key = page ? '/verify' : e.request;
  e.respondWith(
    fetch(e.request)
      .then((res) => { if (res.ok) { const cl = res.clone(); caches.open(C).then((c) => c.put(key, cl)); } return res; })
      .catch(() => caches.match(key, { ignoreSearch: page }).then((r) => r || new Response('offline', { status: 503 }))),
  );
});
