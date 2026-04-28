const CACHE_NAME = "trip-park-v1";

const STATIC_ASSETS = [
  "/",
  "/groups",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ── プッシュ通知 ──────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}

  // FCM ペイロード形式:
  //   Chrome (GCM経由): payload.data._title
  //   iOS   (APNs経由): payload._title  or  payload.notification.title
  const data  = payload.data || {};
  const title = data._title
    || payload._title
    || (payload.notification && payload.notification.title)
    || "Trip Park";
  const body  = data._body
    || payload._body
    || (payload.notification && payload.notification.body)
    || "";
  const url   = data.url || payload.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── フェッチキャッシュ ────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase / 外部APIはキャッシュしない
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com") ||
    url.hostname.includes("firebase") ||
    request.method !== "GET"
  ) {
    return;
  }

  // ナビゲーションリクエスト: ネットワーク優先、失敗時にキャッシュ
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match("/"))),
    );
    return;
  }

  // 静的アセット: キャッシュ優先
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
            return response;
          }),
      ),
    );
    return;
  }
});
