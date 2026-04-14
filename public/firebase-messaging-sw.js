// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

self.addEventListener('install', function () { self.skipWaiting(); });
// clients.claim() は既存ページを強制再制御して React state を破壊するため削除
self.addEventListener('activate', function (event) { event.waitUntil(Promise.resolve()); });

// ── Firebase 初期化（クエリパラメータから設定を受け取る）────────────────
let firebaseReady = false;
const searchParams = new URLSearchParams(self.location.search);
const configStr = searchParams.get('firebaseConfig');

if (configStr) {
  try {
    const firebaseConfig = JSON.parse(decodeURIComponent(configStr));
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    firebaseReady = true;

    // Firebase SDK が notification メッセージを自動表示する。
    // data-only メッセージの場合のみ onBackgroundMessage が呼ばれる。
    messaging.onBackgroundMessage(function (payload) {
      const data = payload.data ?? {};
      const title = data._title ?? payload.notification?.title ?? 'Trip Park';
      const body  = data._body  ?? payload.notification?.body  ?? '';
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon.png',
        badge: '/icons/icon.png',
        data,
        vibrate: [200, 100, 200],
      });
    });
  } catch (e) {
    console.error('[SW] Firebase init error', e);
  }
}

// ── raw push フォールバック（Firebase 初期化失敗時 or notification+data 形式）
// Firebase SDK が push イベントを処理できない場合に通知を確実に表示する。
// Firebase SDK がハンドルした場合は重複しないよう firebaseReady フラグで制御。
if (!firebaseReady) {
  self.addEventListener('push', function (event) {
    var payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (e) {}
    // Chrome: payload.data._title  / iOS APNs: payload._title or payload.notification.title
    var data  = payload.data || {};
    var title = data._title || payload._title
      || (payload.notification && payload.notification.title) || 'Trip Park';
    var body  = data._body  || payload._body
      || (payload.notification && payload.notification.body)  || '';
    var url   = data.url || payload.url || '/';
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: '/icons/icon.png',
        badge: '/icons/icon.png',
        data: { url: url },
        vibrate: [200, 100, 200],
      })
    );
  });
}

// ── 通知クリック ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) { return clients.openWindow(url); }
    })
  );
});
