/* Yat's List service worker: 数据永远 network-first（清单每天更新，不能让缓存喂旧数据） */
const CACHE = 'yatslist-v1';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/szevents/', '/manifest.webmanifest'])).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isData = /\.(json|ics|xml)$/.test(url.pathname);
  const isImg = url.hostname === 'img.yatslist.com';
  if (isImg) {
    // 分享图与图标按 id 冻结，缓存优先
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (isData || req.mode === 'navigate') {
    // 数据与页面：先网络（保证新鲜），断网时回缓存
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // 其他静态资源：缓存优先、后台更新
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
