"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  clearCachedFcmToken,
  removeFcmToken,
  requestAndGetFcmToken,
  saveFcmToken,
} from "@/lib/firebase/messaging";
import { useEffect, useState } from "react";

const PREF_KEY = "push_notification_pref";

type PushStatus =
  | "loading"    // 初期化中
  | "unsupported" // ブラウザ非対応
  | "blocked"    // ブラウザで拒否済み（設定変更が必要）
  | "enabled"    // 有効
  | "disabled";  // 無効（許可はされているが OFF にしている、または未設定）

/** プッシュ通知の ON/OFF を切り替えられる設定行コンポーネント */
export function PushNotificationToggle() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    const pref = localStorage.getItem(PREF_KEY);
    if (Notification.permission === "denied") {
      setStatus("blocked");
    } else if (Notification.permission === "granted" && pref !== "denied") {
      setStatus("enabled");
    } else {
      setStatus("disabled");
    }
  }, []);

  async function handleEnable() {
    if (!user || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = await requestAndGetFcmToken();
      if (token) {
        await saveFcmToken(user.uid, token);
        localStorage.setItem(PREF_KEY, "granted");
        setStatus("enabled");
        setMessage("プッシュ通知を有効にしました");
      } else {
        // 許可ダイアログで拒否された場合
        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          setStatus("blocked");
          setMessage("ブラウザで通知がブロックされています。ブラウザの設定から許可してください。");
        } else {
          setMessage("通知の有効化に失敗しました。しばらくしてから再試行してください。");
        }
      }
    } catch {
      setMessage("エラーが発生しました。再試行してください。");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!user || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // 現在のトークンを取得して Firestore から削除
      const token = await requestAndGetFcmToken().catch(() => null);
      if (token) {
        await removeFcmToken(user.uid, token).catch(() => {});
      }
    } catch {
      // トークン削除に失敗しても OFF にする
    } finally {
      localStorage.setItem(PREF_KEY, "denied");
      clearCachedFcmToken();
      setStatus("disabled");
      setMessage("プッシュ通知を無効にしました");
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">プッシュ通知</p>
          <p className="mt-0.5 text-xs text-zinc-400">読み込み中…</p>
        </div>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">プッシュ通知</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            このブラウザはプッシュ通知に対応していません
          </p>
        </div>
      </div>
    );
  }

  const isEnabled = status === "enabled";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`h-4 w-4 shrink-0 ${isEnabled ? "text-blue-500" : "text-zinc-400"}`}>
              <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.091 32.091 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.085 32.085 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">プッシュ通知</p>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {status === "blocked"
              ? "ブラウザで通知がブロックされています"
              : isEnabled
                ? "掲示板の投稿・返信などをお知らせします"
                : "タップして有効にする"}
          </p>
        </div>

        {/* トグルスイッチ / ブロック表示 */}
        {status === "blocked" ? (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
            ブロック中
          </span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            disabled={busy}
            onClick={isEnabled ? handleDisable : handleEnable}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 ${
              isEnabled ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                isEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        )}
      </div>

      {/* ブロック時の案内 */}
      {status === "blocked" && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          ブラウザの設定 → このサイトの通知を「許可」に変更してからページを再読み込みしてください。
        </p>
      )}

      {/* 操作結果メッセージ */}
      {message && (
        <p className={`mt-2 text-xs ${message.includes("失敗") || message.includes("エラー") || message.includes("ブロック")
          ? "text-red-500 dark:text-red-400"
          : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {message}
        </p>
      )}

      {/* 処理中インジケーター */}
      {busy && (
        <p className="mt-1 text-xs text-zinc-400">処理中…</p>
      )}
    </div>
  );
}
