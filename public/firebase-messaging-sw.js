// Service Worker for Push Notifications
// Firebase SDK を使わず raw push イベントで直接通知を表示する。
// CDN 依存・Firebase 初期化エラーを排除し iOS での確実な通知表示を実現。

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function () {});

self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}

  // FCM ペイロード形式への対応:
  //   Chrome (GCM経由):  payload.data._title
  //   iOS (APNs経由):    payload._title  または  payload.notification.title
  //   notification+data: payload.notification.title (fallback)
  var data  = payload.data || {};
  var title = data._title
    || payload._title
    || (payload.notification && payload.notification.title)
    || 'Trip Park';
  var body  = data._body
    || payload._body
    || (payload.notification && payload.notification.body)
    || '';
  var url   = data.url || payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.location.origin) !== -1 && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
