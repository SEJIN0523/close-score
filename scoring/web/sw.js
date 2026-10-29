// 오프라인 지원: 화면·데이터는 먼저 인터넷에서 받고, 안 되면 저장해 둔 것을 보여준다
const CACHE = 'close-score-v5';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // GitHub API 등은 그대로
  const key = url.pathname.endsWith('/data.json') ? new URL('data.json', self.registration.scope).href : e.request;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(key, c)); } return r; })
    .catch(() => caches.match(key).then(r => r || caches.match('index.html'))));
});
