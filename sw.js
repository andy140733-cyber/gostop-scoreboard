/* sw.js — 오프라인 지원 서비스워커 (앱 셸 캐시) */
const CACHE = 'gostop-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/scoring.js',
  './js/store.js',
  './js/records.js',
  './js/ledger.js',
  './js/money.js',
  './js/stats.js',
  './js/backup.js',
  './js/ui.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 네트워크 우선(최신 반영) → 실패 시 캐시(오프라인). 동일 출처 GET은 캐시에 갱신 보관.
// 편집 후 재배포하면 온라인에서 바로 최신 버전이 보이고, 오프라인에선 마지막 캐시로 동작.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let sameOrigin = false;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (_) {}
  if (!sameOrigin) return; // 타 출처는 브라우저 기본 처리

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
