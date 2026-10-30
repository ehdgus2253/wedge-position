// 오프라인 실행을 위한 파일 저장(캐시) 설정
// 프로그램 파일(index.html, app.js, config.js, style.css)을 수정해서 다시 올릴 때는
// 아래 VERSION 숫자를 하나 올려 주세요. 그래야 모든 사람의 앱이 새 버전으로 바뀝니다.
const VERSION = 'v3';
const CACHE = 'wedge-position-' + VERSION;
const FILES = ['./', './index.html', './style.css', './config.js', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 인터넷이 되면 최신 파일을 받아오고, 안 되면 저장된 파일로 실행
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
