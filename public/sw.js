const CACHE_NAME = "trip-park-v4";
const APP_SHELL = "/dashboard";
const LAST_TRIP_HOME = "/__last_trip_home__";
const OFFLINE_PAGE = "/offline.html";
const NAVIGATE_TIMEOUT_MS = 2200;

const STATIC_ASSETS = [
  APP_SHELL,
  OFFLINE_PAGE,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            // 個別失敗はインストール全体を止めない
          }),
        ),
      ),
    ),
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
  const url   = data.url || payload.url || APP_SHELL;

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
  const url = (event.notification.data && event.notification.data.url) || APP_SHELL;
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

function cachePut(request, response) {
  if (!response || !response.ok) return;
  const cloned = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
}

/** 旅行ホーム `/groups/{id}`（サブパスは除く） */
function isTripHomePath(pathname) {
  return /^\/groups\/[^/]+\/?$/.test(pathname);
}

function rememberLastTripHome(response) {
  if (!response || !response.ok) return;
  const cloned = response.clone();
  caches.open(CACHE_NAME).then((cache) =>
    cache.put(new Request(LAST_TRIP_HOME), cloned).catch(() => {}),
  );
}

function matchOfflineFallback() {
  return caches.match(OFFLINE_PAGE).then((r) => r ?? Response.error());
}

/**
 * ネットワーク優先。遅ければ同一 URL のキャッシュへ。
 * 旅行ホームは直近シェルとしても保持。最終手段は offline.html。
 */
function networkFirstWithTimeout(request, timeoutMs) {
  const pathname = new URL(request.url).pathname;

  const networkPromise = fetch(request).then((response) => {
    cachePut(request, response);
    if (isTripHomePath(pathname)) {
      rememberLastTripHome(response);
    }
    return response;
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  return Promise.race([networkPromise, timeoutPromise]).catch(() =>
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return networkPromise.catch(() =>
        caches.match(APP_SHELL).then((shell) => {
          if (shell) return shell;
          if (isTripHomePath(pathname)) {
            return caches.match(LAST_TRIP_HOME).then((last) =>
              last ?? matchOfflineFallback(),
            );
          }
          return matchOfflineFallback();
        }),
      );
    }),
  );
}

/** /dashboard: キャッシュ即返し＋裏で更新（起動の待ちを短縮） */
function staleWhileRevalidateNavigate(request) {
  return caches.match(request).then((cached) => {
    const networkPromise = fetch(request)
      .then((response) => {
        cachePut(request, response);
        return response;
      })
      .catch(() => null);

    if (cached) {
      void networkPromise;
      return cached;
    }

    return networkPromise.then((response) => {
      if (response) return response;
      return caches.match(LAST_TRIP_HOME).then((last) =>
        last ?? matchOfflineFallback(),
      );
    });
  });
}

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

  // 仮想キーはネットワークに出さない
  if (url.pathname === LAST_TRIP_HOME) {
    event.respondWith(
      caches.match(LAST_TRIP_HOME).then((r) => r ?? matchOfflineFallback()),
    );
    return;
  }

  if (request.mode === "navigate") {
    const path = url.pathname;
    if (path === APP_SHELL || path === `${APP_SHELL}/`) {
      event.respondWith(staleWhileRevalidateNavigate(request));
      return;
    }
    event.respondWith(networkFirstWithTimeout(request, NAVIGATE_TIMEOUT_MS));
    return;
  }

  // ハッシュ付き静的アセット・アイコンは cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === OFFLINE_PAGE ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          cachePut(request, response);
          return response;
        });
      }),
    );
  }
});
