// =============================================================
//  service worker — 離線快取（stale-while-revalidate）
//  改咗內容之後，bump CACHE 版本號就會強制更新。
// =============================================================

const CACHE = "duosbc-v12";
const ASSETS = [
  "./",
  "./index.html",
  "./teacher.html",
  "./styles.css",
  "./app.js",
  "./srs.js",
  "./storage.js",
  "./words.js",
  "./words-senior.js",
  "./firebase-config.js",
  "./sync.js",
  "./teacher.js",
  "./feedback.js",
  "./enrichments.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (new URL(req.url).origin === self.location.origin || req.url.includes("gstatic.com"))) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match("./index.html"));

      // 有快取就即刻還，同時靜靜喺背景更新
      return cached || network;
    })
  );
});
