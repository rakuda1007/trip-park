import "client-only";

import { getFirebaseApp } from "@/lib/firebase/client";
import { getFirebasePublicConfig } from "@/lib/firebase/env";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

/**
 * ServiceWorkerRegistration が active 状態になるまで待つ。
 * 既に active なら即座に返す。タイムアウト（ms）を超えたら諦めて返す。
 */
function waitForActiveRegistration(
  registration: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<void> {
  if (registration.active) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);

    const sw = registration.installing ?? registration.waiting;
    if (!sw) { clearTimeout(timer); resolve(); return; }

    const onStateChange = () => {
      if (sw.state === "activated") {
        clearTimeout(timer);
        sw.removeEventListener("statechange", onStateChange);
        resolve();
      }
    };
    sw.addEventListener("statechange", onStateChange);
  });
}

let _messaging: Messaging | null = null;

function getFirebaseMessaging(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (_messaging) return _messaging;
  try {
    _messaging = getMessaging(getFirebaseApp());
    return _messaging;
  } catch {
    return null;
  }
}

/**
 * サービスワーカーを登録して FCM トークンを取得する。
 * NEXT_PUBLIC_FIREBASE_VAPID_KEY が設定されている必要がある。
 */
export async function requestAndGetFcmToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window)) return null;
  if (!("serviceWorker" in navigator)) return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn("[FCM] NEXT_PUBLIC_FIREBASE_VAPID_KEY が設定されていません。");
    return null;
  }

  // 通知許可の確認
  if (Notification.permission === "denied") return null;
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) return null;

  // Firebase Config をクエリパラメータとしてサービスワーカーに渡す
  const firebaseConfig = getFirebasePublicConfig();
  const configParam = encodeURIComponent(JSON.stringify(firebaseConfig));
  const swUrl = `/firebase-messaging-sw.js?firebaseConfig=${configParam}`;

  const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });

  // registration を直接使用する。navigator.serviceWorker.ready は他の SW が
  // waiting 状態の場合にハングするため使用しない。
  // 登録した SW が active になるまで最大 5 秒待つ。
  await waitForActiveRegistration(registration, 5000);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  return token ?? null;
}

/** FCM トークンを Firestore の users/{uid} に保存する */
export async function saveFcmToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseFirestore();
  const userRef = doc(db, "users", uid);
  // 既存のドキュメントがなければ作成は skip（ユーザー本人のドキュメントは別途作成済み前提）
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    await updateDoc(userRef, {
      fcmTokens: arrayUnion(token),
    });
  }
}

/** FCM トークンを Firestore から削除する（通知オフ時・ログアウト時） */
export async function removeFcmToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseFirestore();
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    await updateDoc(userRef, {
      fcmTokens: arrayRemove(token),
    });
  }
}

/** フォアグラウンドのメッセージハンドラーを登録する */
export function setupForegroundMessageHandler(
  onReceived: (title: string, body: string, url?: string) => void,
): (() => void) | null {
  const messaging = getFirebaseMessaging();
  if (!messaging) return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Trip Park";
    const body = payload.notification?.body ?? "";
    const url = (payload.data?.url as string | undefined);
    onReceived(title, body, url);
  });

  return unsubscribe;
}
