/*
 * Service worker: فقط «پوسته‌ی برنامه» را برای بازشدن بدون اینترنت نگه می‌دارد.
 * پاسخ API را هرگز کش نمی‌کند (داده‌ی کاربران/فروشگاه‌های مختلف روی یک دستگاه نباید قاطی شود).
 * دو مقدار قالب پایین فایل (نسخه و فهرست precache) هنگام بیلد توسط vite.config.ts پر می‌شوند.
 */
const CACHE = 'yadaki-shell-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yadaki-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // API: همیشه شبکه

  // ناوبری: اول شبکه (نسخه‌ی تازه)، اگر قطع بود index.html کش‌شده؛ مسیرهای SPA همه همین فایل را می‌گیرند
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // فایل‌های ثابت: اول کش (نام فایل‌های /assets/ هش دارد)، وگرنه شبکه
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith('/assets/')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
