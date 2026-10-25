/* Merteks AI — service worker.
   Network-first for the site's own files (updates arrive as soon as you are online),
   cache fallback so the app shell still opens when the connection is bad or gone.
   Other origins (Supabase, fonts, …) and non-GET requests are never touched. */
var VERSION = 'mx-shell-v1';
var SHELL = [
  'app.html', 'ai.html',
  'css/mxai.css?v=10',
  'js/config.js?v=16', 'js/mx-store.js?v=9', 'js/gate.js?v=9', 'js/ai-tools.js?v=1', 'js/ai-app.js?v=10',
  'fonts/Vazirmatn.woff2', 'merteks-ai.webmanifest',
  'assets/merteks-ai-128.png', 'assets/merteks-ai-180.png', 'assets/merteks-ai-192.png', 'assets/merteks-ai-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { fromCache(req).then(function (r) { if (r && !done) { done = true; resolve(r); } }); }, 4000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      if (!done) { done = true; resolve(res); }
    }, function () {
      clearTimeout(timer);
      fromCache(req).then(function (r) { if (!done) { done = true; resolve(r || Response.error()); } });
    });
  });
}

function fromCache(req) {
  return caches.match(req).then(function (r) {
    return r || caches.match(req, { ignoreSearch: true });
  });
}
