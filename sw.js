/* 主畫面 App（PWA）的離線快取（使用者 11/21：「先做主畫面 App」）
   ・入口頁（index.html）與加密的遊戲檔（game.bin）：先連網抓最新版，抓到就存一份；沒有網路時才用存著的那份，所以平常更新不會被卡住
   ・圖示與 manifest：有存的就直接用
   ・只處理這個網站自己的 GET 請求；排行榜、雲端同步（Firebase）等其他網站的連線完全不碰 */
const CACHE = 'cch-app-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isPage = u => u.pathname.endsWith('/') || u.pathname.endsWith('/index.html');
const isGame = u => u.pathname.endsWith('/game.bin');

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (isPage(u) || isGame(u) || req.mode === 'navigate') {
    // 遊戲裡的「有新版本」檢查（?t=…、cache: no-store）也走這裡：有網路就是最新的
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        // 入口頁不用瀏覽器的 HTTP 快取（GitHub Pages 會讓舊頁面留 10 分鐘）：每次都問伺服器有沒有新版（沒變只回 304，很省流量）
        const r = isGame(u) ? await fetch(req) : await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (r.ok) {
          if (isGame(u)) { // 新版的 game.bin 存起來，舊版的刪掉（每一版的網址帶 ?v=版本號）
            for (const k of await c.keys()) if (isGame(new URL(k.url)) && k.url !== req.url) await c.delete(k);
            await c.put(req, r.clone());
          } else if (!u.search) await c.put(req, r.clone()); // 入口頁只存沒有參數的那份（離線時打開 App 用）
        }
        return r;
      } catch (err) {
        const page = isPage(u) || req.mode === 'navigate';
        const hit = (await c.match(req)) || (page ? (await c.match('./', { ignoreSearch: true })) || (await c.match('index.html', { ignoreSearch: true })) : null);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
  // 圖示、manifest：有存的就用
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
