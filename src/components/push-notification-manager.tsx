"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  removeFcmToken,
  requestAndGetFcmToken,
  saveFcmToken,
  setupForegroundMessageHandler,
} from "@/lib/firebase/messaging";
import { useEffect, useRef, useState } from "react";

const PREF_KEY = "push_notification_pref"; // "granted" | "denied" | unset

type ToastItem = { id: number; title: string; body: string; url?: string };

/**
 * Push通知の許可リクエストとフォアグラウンド受信を管理するコンポーネント。
 * アプリのルートレイアウトに配置する。
 */
export function PushNotificationManager() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const tokenRef = useRef<string | null>(null);
  const toastIdRef = useRef(0);

  // 初回マウント時に過去の許可状態を確認
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    const pref = localStorage.getItem(PREF_KEY);
    if (pref === "denied") return;
    if (Notification.permission === "granted") {
      // 既に許可済み → トークンを取得して保存
      initToken(user.uid);
    } else if (Notification.permission === "default" && !pref) {
      // 初めてアクセス → バナーを表示
      setShowBanner(true);
    }
  }, [user]); // initToken は user が変わった時だけ実行すれば十分

  // フォアグラウンドメッセージハンドラー登録
  useEffect(() => {
    if (!user) return;
    const unsubscribe = setupForegroundMessageHandler((title, body, url) => {
      addToast(title, body, url);
    });
    return () => { unsubscribe?.(); };
  }, [user]);

  async function initToken(uid: string) {
    try {
      console.log("[Push] Requesting FCM token for uid:", uid);
      const token = await requestAndGetFcmToken();
      if (token) {
        tokenRef.current = token;
        await saveFcmToken(uid, token);
        console.log("[Push] Token saved successfully.");
      } else {
        console.warn("[Push] requestAndGetFcmToken returned null. Permission:", Notification.permission);
      }
    } catch (e) {
      console.warn("[Push] Token init error:", e);
    }
  }

  async function handleAllow() {
    setShowBanner(false);
    if (!user) return;
    localStorage.setItem(PREF_KEY, "granted");
    await initToken(user.uid);
  }

  async function handleDeny() {
    setShowBanner(false);
    localStorage.setItem(PREF_KEY, "denied");
    if (user && tokenRef.current) {
      await removeFcmToken(user.uid, tokenRef.current).catch(() => {});
    }
  }

  function addToast(title: string, body: string, url?: string) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, title, body, url }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }

  return (
    <>
      {/* 通知許可バナー */}
      {showBanner && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-blue-600 dark:text-blue-400">
                <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.091 32.091 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.085 32.085 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                プッシュ通知を有効にしますか？
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                掲示板の投稿・返信などをお知らせします
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleAllow}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  有効にする
                </button>
                <button
                  type="button"
                  onClick={handleDeny}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  後で
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* フォアグラウンド通知トースト */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => {
              if (toast.url) window.location.href = toast.url;
              setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }}
            className="w-72 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-lg transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{toast.title}</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{toast.body}</p>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * 通知APIを呼び出すユーティリティ。
 * クライアントコンポーネントから呼ぶ。
 */
export async function sendNotification(
  idToken: string,
  payload: object,
): Promise<void> {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // 通知送信の失敗はユーザー体験に影響させない
  }
}
