"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  clearCachedFcmToken,
  getCachedFcmToken,
  removeFcmToken,
  requestAndGetFcmToken,
  saveFcmToken,
} from "@/lib/firebase/messaging";
import { useEffect, useState } from "react";

const PREF_KEY = "push_notification_pref";

type PushStatus =
  | "loading"      // 初期化中
  | "unsupported"  // ブラウザ非対応
  | "not-pwa"      // iOSでホーム画面追加が必要
  | "blocked"      // ブラウザで拒否済み
  | "enabled"      // 有効
  | "disabled";    // 無効

/** iOS Safari でホーム画面に追加されていない（非 PWA）かどうか */
function isIosNonPwa(): boolean {
  if (typeof window === "undefined") return false;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIos) return false;
  // ホーム画面から起動している場合は standalone になる
  const isStandalone =
    ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches;
  return !isStandalone;
}

/** プッシュ通知の ON/OFF を切り替えられる設定行コンポーネント */
export function PushNotificationToggle() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);   // 処理ステップ
  const [error, setError] = useState<string | null>(null); // エラー詳細

  useEffect(() => {
    if (typeof window === "undefined") return;

    // iOS非PWA：通知自体サポート外
    if (isIosNonPwa()) {
      setStatus("not-pwa");
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }

    const pref = localStorage.getItem(PREF_KEY);

    // iOS Safari では requestPermission() 後にページがリロードされる。
    // リロード前に立てた sessionStorage フラグが残っている場合は
    // 許可が完了した直後なので、自動的にトークン取得を再開する。
    const permRequested = (() => {
      try { return sessionStorage.getItem("push_permission_requested") === "1"; }
      catch { return false; }
    })();

    if (permRequested && Notification.permission === "granted") {
      try { sessionStorage.removeItem("push_permission_requested"); } catch { /* ignore */ }
      // pref が "denied" でも今回ユーザーが許可したので上書きする
      localStorage.removeItem(PREF_KEY);
      // ステータスを loading のまま保ち、トークン取得を自動実行
      setStep("リロード後の設定を完了中…");
      return; // user が揃ったら下の useEffect でトークン取得する
    }

    if (Notification.permission === "denied") {
      setStatus("blocked");
    } else if (Notification.permission === "granted" && pref !== "denied") {
      setStatus("enabled");
    } else {
      setStatus("disabled");
    }
  }, []);

  // iOS リロード後の自動トークン取得
  // step が "リロード後の設定を完了中…" かつ user が確定したときに実行
  useEffect(() => {
    if (!user) return;
    if (step !== "リロード後の設定を完了中…") return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        setStep("FCMトークンを取得中…");
        const token = await requestAndGetFcmToken({ forceRefresh: true });
        if (cancelled) return;
        if (token) {
          await saveFcmToken(user.uid, token);
          localStorage.setItem(PREF_KEY, "granted");
          setStatus("enabled");
          setStep(null);
        } else {
          setError("トークン取得に失敗しました。もう一度トグルをタップしてください。");
          setStatus("disabled");
          setStep(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Push] auto-complete after iOS reload failed:", err);
        setError(`エラー: ${msg}`);
        setStatus("disabled");
        setStep(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleEnable() {
    if (!user || busy) return;
    setBusy(true);
    setStep("開始中…");
    setError(null);

    try {
      setStep("通知許可を確認中…");
      const token = await requestAndGetFcmToken({ forceRefresh: true });

      if (token) {
        setStep("Firestoreに保存中…");
        await saveFcmToken(user.uid, token);
        localStorage.setItem(PREF_KEY, "granted");
        setStatus("enabled");
        setStep(null);
      } else {
        // null = ユーザーが許可ダイアログで拒否 or iOSでブラウザ側に拒否された
        const perm = typeof Notification !== "undefined" ? Notification.permission : "unknown";
        if (perm === "denied") {
          setStatus("blocked");
          setError("ブラウザで通知がブロックされています。ブラウザの設定から「許可」に変更してください。");
        } else {
          setError(`FCMトークンが取得できませんでした（permission: ${perm}）。iOSの場合はホーム画面に追加してから再試行してください。`);
        }
        setStep(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Push] handleEnable failed:", err);
      setError(`エラー: ${msg}`);
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (!user || busy) return;
    setBusy(true);
    setStep("無効化中…");
    setError(null);
    try {
      // キャッシュからトークンを取得（SW登録・通知許可は不要）
      const token = getCachedFcmToken();
      if (token) {
        await removeFcmToken(user.uid, token).catch((err) => {
          console.warn("[Push] removeFcmToken:", err);
        });
      }
    } finally {
      localStorage.setItem(PREF_KEY, "denied");
      clearCachedFcmToken();
      setStatus("disabled");
      setStep(null);
      setBusy(false);
    }
  }

  // ── ローディング中 ──
  if (status === "loading") {
    return <NotifyRow label="プッシュ通知" sub="読み込み中…" />;
  }

  // ── ブラウザ非対応 ──
  if (status === "unsupported") {
    return <NotifyRow label="プッシュ通知" sub="このブラウザは対応していません" />;
  }

  // ── iOS Safari（非 PWA）──
  if (status === "not-pwa") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">プッシュ通知</p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          iOSでプッシュ通知を使うには、Safari の「共有」→「ホーム画面に追加」でアプリをインストールし、ホーム画面から起動してください。
        </p>
      </div>
    );
  }

  const isEnabled = status === "enabled";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between gap-4">
        {/* ラベル */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`h-4 w-4 shrink-0 ${isEnabled ? "text-blue-500" : "text-zinc-400"}`}>
              <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.091 32.091 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.085 32.085 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">プッシュ通知</p>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {busy && step
              ? step
              : status === "blocked"
                ? "ブラウザで通知がブロックされています"
                : isEnabled
                  ? "掲示板の投稿・返信などをお知らせします"
                  : "タップして有効にする"}
          </p>
        </div>

        {/* トグル / ブロックバッジ */}
        {status === "blocked" ? (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
            ブロック中
          </span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label={isEnabled ? "プッシュ通知を無効にする" : "プッシュ通知を有効にする"}
            disabled={busy}
            onClick={isEnabled ? handleDisable : handleEnable}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60 ${
              isEnabled ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-600"
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${isEnabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        )}
      </div>

      {/* ブロック時の案内 */}
      {status === "blocked" && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          ブラウザの設定 → このサイトの通知を「許可」に変更してからページを再読み込みしてください。
        </p>
      )}

      {/* エラー詳細（赤字・目立つ） */}
      {error && !busy && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

function NotifyRow({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
      </div>
    </div>
  );
}
