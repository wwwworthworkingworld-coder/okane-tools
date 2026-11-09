/* ふるさと納税ツールをオフラインでも開けるようにする（記録はlocalStorageにあり、ここでは画面だけを保存）
 * 登録の scope は furusato-keisan.html だけ（経費メモの keihi-sw.js と同じサイトにあるため、取り合わないように） */
const CACHE = "furusato-v2";
const FILES = ["furusato-keisan.html", "assets/style.css", "assets/calc.js", "assets/furusato.js", "assets/ui.js", "assets/yomi.js", "furusato-manifest.json", "assets/icon-192.png"];
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
