import "client-only";

import { getFirebaseApp } from "@/lib/firebase/client";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { doc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import type { Messaging } from "firebase/messaging";

// FCMトークンを localStorage にキャッシュする（24時間有効）
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
 */
function waitForActiveRegistration(
  registration: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<void> {
  if (registration.active) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);

    const sw = registration.installing ?? registration.waiting;
    if (!sw) {
      clearTimeout(timer);
      resolve();
      return;
    }

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

/** firebase/messaging は起動時チャンクから外し、初回利用時にだけ読む */
async function loadMessagingApi() {
  return import("firebase/messaging");
}

async function getFirebaseMessaging(): Promise<Messaging> {
  if (_messaging) return _messaging;
  const { getMessaging } = await loadMessagingApi();
  _messaging = getMessaging(getFirebaseApp());
  return _messaging;
}

/**
 * サービスワーカーを登録して FCM トークンを取得する。
 */
export async function requestAndGetFcmToken(opts?: {
  forceRefresh?: boolean;
  onStep?: (step: string) => void;
}): Promise<string | null> {
  if (typeof window === "undefined") return null;

  if (!("Notification" in window)) {
    throw new Error("このブラウザは通知API（Notification）に対応していません");
  }
  if (!("serviceWorker" in navigator)) {
    throw new Error("このブラウザはService Workerに対応していません");
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error(
      "VAPID キーが設定されていません（環境変数 NEXT_PUBLIC_FIREBASE_VAPID_KEY）",
    );
  }

  if (Notification.permission === "denied") {
    return null;
  }
  if (Notification.permission === "default") {
    console.log("[FCM] 通知許可ダイアログを表示します...");
    try {
      localStorage.setItem(
        "push_perm_requesting",
        JSON.stringify({ ts: Date.now() }),
      );
    } catch {
      /* ignore */
    }
    const permission = await Notification.requestPermission();
    console.log("[FCM] 許可結果:", permission);
    try {
      localStorage.removeItem("push_perm_requesting");
    } catch {
      /* ignore */
    }
    if (permission !== "granted") return null;
  }

  if (!opts?.forceRefresh) {
    const cached = getCachedFcmToken_private();
    if (cached) {
      console.log("[FCM] キャッシュからトークンを返します");
      return cached;
    }
  }

  const report = (msg: string) => {
    console.log(`[FCM] ${msg}`);
    opts?.onStep?.(msg);
  };

  report("Messaging初期化中...");
  const { getToken, deleteToken } = await loadMessagingApi();
  const messaging = await getFirebaseMessaging();

  if (opts?.forceRefresh) {
    try {
      report("push subscriptionをリセット中...");
      await deleteToken(messaging);
      report("リセット完了");
    } catch {
      report("リセットスキップ（既存トークンなし）");
    }
  }

  report("SW確認中...");
  let registration: ServiceWorkerRegistration | undefined;

  registration = await navigator.serviceWorker.getRegistration("/");
  if (registration) {
    const swName =
      registration.active?.scriptURL?.split("?")[0]?.split("/").pop() ??
      "unknown";
    report(`ルートSW再利用: ${swName}`);
    try {
      await registration.update();
      await waitForActiveRegistration(registration, 3000);
      report(`SW更新確認完了: ${registration.active?.state ?? "unknown"}`);
    } catch {
      // update() 失敗は無視
    }
  } else {
    registration = await navigator.serviceWorker.getRegistration("/fcm/");
    if (!registration) {
      report("SW新規登録中...");
      const registerPromise = navigator.serviceWorker.register(
        "/api/firebase-sw",
        { scope: "/fcm/" },
      );
      const regTimeout = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Service Worker の登録がタイムアウトしました（10秒）"),
            ),
          10_000,
        ),
      );
      registration = await Promise.race([registerPromise, regTimeout]);
      report("SW登録完了");
    } else {
      report("/fcm/ SW再利用");
    }
  }

  report("SW有効化待ち...");
  await waitForActiveRegistration(registration, 5000);
  report(`SW状態: ${registration.active?.state ?? "unknown"}`);

  report("getToken呼び出し中...");
  const tokenPromise = getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            "FCMトークン取得がタイムアウトしました（15秒）。Firebase ConsoleでWeb Push証明書（VAPIDキー）が設定されているか確認してください。",
          ),
        ),
      15_000,
    ),
  );
  const token = await Promise.race([tokenPromise, timeoutPromise]);

  if (token) {
    report(`トークン取得成功: ${token.slice(0, 20)}...`);
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

/**
 * フォアグラウンドのメッセージハンドラーを登録する。
 * messaging モジュールは遅延ロードする。
 */
export function setupForegroundMessageHandler(
  onReceived: (title: string, body: string, url?: string) => void,
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  void (async () => {
    try {
      if (typeof window === "undefined") return;
      const { onMessage } = await loadMessagingApi();
      if (cancelled) return;
      const messaging = await getFirebaseMessaging();
      if (cancelled) return;
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Trip Park";
        const body = payload.notification?.body ?? "";
        const url = payload.data?.url as string | undefined;
        onReceived(title, body, url);
      });
    } catch {
      // messaging 非対応環境は無視
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
