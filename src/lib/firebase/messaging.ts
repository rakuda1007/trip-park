import "client-only";

import { getFirebaseApp } from "@/lib/firebase/client";
import { getFirebasePublicConfig } from "@/lib/firebase/env";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { doc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

// FCMトークンを localStorage にキャッシュする（24時間有効）
// FCMトークン自体は60日有効なので24時間キャッシュで十分
const TOKEN_CACHE_KEY = "fcm_token_cache";
const TOKEN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24時間

function getCachedFcmToken_private(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const { token, ts } = JSON.parse(raw) as { token: string; ts: number };
    if (Date.now() - ts > TOKEN_CACHE_TTL) return null;
    return token;
  } catch {
    return null;
  }
}

function setCachedFcmToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token, ts: Date.now() }));
  } catch {
    // localStorage が使えない環境では無視
  }
}

/** キャッシュ済みトークンを返す（ない場合は null） */
export function getCachedFcmToken(): string | null {
  return getCachedFcmToken_private();
}

/** キャッシュを無効化する（通知 OFF 時に呼ぶ） */
export function clearCachedFcmToken(): void {
  try {
    localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    // ignore
  }
}

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

function getFirebaseMessaging(): Messaging {
  if (_messaging) return _messaging;
  _messaging = getMessaging(getFirebaseApp());
  return _messaging;
}

/**
 * サービスワーカーを登録して FCM トークンを取得する。
 * キャッシュがある場合はSW登録・ネットワーク通信をスキップして即座に返す。
 * NEXT_PUBLIC_FIREBASE_VAPID_KEY が設定されている必要がある。
 *
 * エラー時は例外を投げる（呼び出し元で catch してメッセージを表示すること）。
 */
export async function requestAndGetFcmToken(opts?: { forceRefresh?: boolean }): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // 基本的なブラウザ対応チェック
  if (!("Notification" in window)) {
    throw new Error("このブラウザは通知API（Notification）に対応していません");
  }
  if (!("serviceWorker" in navigator)) {
    throw new Error("このブラウザはService Workerに対応していません");
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error("VAPID キーが設定されていません（環境変数 NEXT_PUBLIC_FIREBASE_VAPID_KEY）");
  }

  // 通知許可の確認
  if (Notification.permission === "denied") {
    return null; // ブロック済み（エラーではない）
  }
  if (Notification.permission === "default") {
    console.log("[FCM] 通知許可ダイアログを表示します...");
    const permission = await Notification.requestPermission();
    console.log("[FCM] 許可結果:", permission);
    if (permission !== "granted") return null;
  }

  // キャッシュヒットなら SW 登録・getToken のネットワーク通信をスキップ
  if (!opts?.forceRefresh) {
    const cached = getCachedFcmToken_private();
    if (cached) {
      console.log("[FCM] キャッシュからトークンを返します");
      return cached;
    }
  }

  // Firebase Messaging インスタンス取得
  console.log("[FCM] Firebase Messaging を初期化します...");
  const messaging = getFirebaseMessaging(); // throws if fails

  // Service Worker 登録
  console.log("[FCM] Service Worker を登録します...");
  const firebaseConfig = getFirebasePublicConfig();
  const configParam = encodeURIComponent(JSON.stringify(firebaseConfig));
  const swUrl = `/firebase-messaging-sw.js?firebaseConfig=${configParam}`;
  const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });

  // SW がアクティブになるまで待つ（最大 5 秒）
  console.log("[FCM] Service Worker のアクティブ化を待ちます...");
  await waitForActiveRegistration(registration, 5000);
  console.log("[FCM] SW状態:", registration.active?.state ?? "unknown");

  // FCM トークン取得
  console.log("[FCM] getToken を呼び出します...");
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (token) {
    console.log("[FCM] トークン取得成功:", token.slice(0, 20) + "...");
    setCachedFcmToken(token);
  } else {
    console.warn("[FCM] getToken が空のトークンを返しました");
  }

  return token || null;
}

/** FCM トークンを Firestore の users/{uid} に保存する */
export async function saveFcmToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseFirestore();
  const userRef = doc(db, "users", uid);
  await setDoc(userRef, { fcmTokens: arrayUnion(token) }, { merge: true });
  console.log("[FCM] Token saved for uid:", uid);
}

/** FCM トークンを Firestore から削除する（通知オフ時・ログアウト時） */
export async function removeFcmToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseFirestore();
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    fcmTokens: arrayRemove(token),
  }).catch(() => {
    // ドキュメントが存在しない場合は無視
  });
}

/** フォアグラウンドのメッセージハンドラーを登録する */
export function setupForegroundMessageHandler(
  onReceived: (title: string, body: string, url?: string) => void,
): (() => void) | null {
  let messaging: Messaging;
  try {
    if (typeof window === "undefined") return null;
    messaging = getFirebaseMessaging();
  } catch {
    return null;
  }

  const unsubscribe = onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Trip Park";
    const body = payload.notification?.body ?? "";
    const url = (payload.data?.url as string | undefined);
    onReceived(title, body, url);
  });

  return unsubscribe;
}
