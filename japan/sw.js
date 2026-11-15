/* Japan Pocket Helper — offline cache. Bump VERSION whenever any file changes. */
var VERSION = "jph-v1-2026-11-16b";
var FILES = ["./", "index.html", "data.js", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== location.origin) return; // analytics etc.: leave to the network, never cache
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit || caches.match("index.html"); });
      return hit || net;
    })
  );
});
