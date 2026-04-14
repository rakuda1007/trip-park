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

  // Firebase SDK を使わず raw push イベントで直接通知を表示する。
  // importScripts（CDN依存）や onBackgroundMessage の複雑な処理を排除し
  // iOS での確実な通知表示を目指す。
  // firebaseConfig はフォールバック用に保持（将来の拡張のため）
  void config;

  const script = `
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function () {});

self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}

  // FCM data-only メッセージ: payload.data._title / payload.data._body
  // FCM notification メッセージ (フォールバック): payload.notification.title 等
  var data = payload.data || {};
  var title = data._title || (payload.notification && payload.notification.title) || 'Trip Park';
  var body  = data._body  || (payload.notification && payload.notification.body)  || '';
  var url   = data.url   || '/';

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
`.trim();

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/fcm/",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
