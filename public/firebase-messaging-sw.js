// Firebase Messaging Service Worker
// クエリパラメータで受け取った設定で初期化する
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

// インストール時に即座にアクティブ化して待機状態のハングを防ぐ
self.addEventListener('install', function () {
  self.skipWaiting();
});

// アクティブ化時に既存のクライアントを即座に制御下に置く
self.addEventListener('activate', function (event) {
  event.waitUntil(clients.claim());
});

let messaging = null;

// Service Worker の URL から Firebase 設定を受け取る
const searchParams = new URLSearchParams(self.location.search);
const configStr = searchParams.get('firebaseConfig');

if (configStr) {
  try {
    const firebaseConfig = JSON.parse(decodeURIComponent(configStr));
    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();

    // バックグラウンドメッセージのハンドリング
    messaging.onBackgroundMessage(function (payload) {
      const title = payload.notification?.title ?? 'Trip Park';
      const body = payload.notification?.body ?? '';
      const icon = payload.notification?.icon ?? '/icons/icon.png';
      const data = payload.data ?? {};

      self.registration.showNotification(title, {
        body,
        icon,
        badge: '/icons/icon.png',
        data,
        vibrate: [200, 100, 200],
      });
    });
  } catch (e) {
    console.error('[SW] Firebase init error', e);
  }
}

// 通知クリック時のハンドリング
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
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
