import { NextResponse } from "next/server";

/**
 * Firebase Messaging Service Worker を動的に配信する。
 * クエリパラメータではなくサーバー側で設定を注入することで、
 * SW の URL を `/api/firebase-sw` に固定し iOS での登録ハングを防ぐ。
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
  };

  const script = `
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(Promise.resolve());
});

var firebaseConfig = ${JSON.stringify(config)};

firebase.initializeApp(firebaseConfig);
var messaging = firebase.messaging();

// data-only 形式で受信し、onBackgroundMessage で通知を表示する
messaging.onBackgroundMessage(function (payload) {
  var data = payload.data || {};
  var title = data._title || (payload.notification && payload.notification.title) || 'Trip Park';
  var body = data._body || (payload.notification && payload.notification.body) || '';
  var icon = '/icons/icon.png';
  self.registration.showNotification(title, {
    body: body,
    icon: icon,
    badge: '/icons/icon.png',
    data: data,
    vibrate: [200, 100, 200],
  });
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
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
`.trim();

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
