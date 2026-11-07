/* 株の記録ツールをオフラインでも開けるようにする（記録はlocalStorageにあり、ここでは画面だけを保存）
 * 登録の scope は kabu-kiroku.html だけ（keihi-sw.js・furusato-sw.js と同じサイトにあるため、取り合わないように） */
const CACHE = "kabu-v1";
const FILES = ["kabu-kiroku.html", "assets/style.css", "assets/kabu-kiroku.js", "assets/ui.js", "kabu-manifest.json", "assets/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
/* ネットにつながるときは最新を取り、つながらないときは保存しておいた画面を出す */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request)));
});
