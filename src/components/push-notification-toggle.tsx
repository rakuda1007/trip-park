"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  clearCachedFcmToken,
  getCachedFcmToken,
  removeFcmToken,
  requestAndGetFcmToken,
  saveFcmToken,
} from "@/lib/firebase/messaging";
import { useEffect, useRef, useState } from "react";

const PREF_KEY = "push_notification_pref";
const FLAG_KEY = "push_perm_requesting";

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
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  // auto-complete のトリガーを ref で管理（state だと step 変化で effect が再実行される）
  const shouldAutoComplete = useRef(false);

  function addDebug(msg: string) {
    setDebugLines((prev) => [...prev.slice(-9), `${new Date().toLocaleTimeString("ja-JP")} ${msg}`]);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isIosNonPwa()) { setStatus("not-pwa"); return; }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported"); return;
    }

    const pref = localStorage.getItem(PREF_KEY);
    const notifPerm = Notification.permission;
    const flagRaw = localStorage.getItem(FLAG_KEY);

    addDebug(`起動: perm=${notifPerm} pref=${pref ?? "null"} flag=${flagRaw ? "あり" : "なし"}`);

    // iOS リロード後フラグを確認
    let permRequested = false;
    if (flagRaw) {
      try {
        const { ts } = JSON.parse(flagRaw) as { ts: number };
        permRequested = Date.now() - ts < 30_000;
      } catch { /* ignore */ }
      localStorage.removeItem(FLAG_KEY);
      addDebug(`フラグ検出: permRequested=${permRequested}`);
    }

    if (permRequested) {
      if (notifPerm === "granted") {
        // iOSリロード後、許可済み → pref解除して自動取得
        localStorage.removeItem(PREF_KEY);
        addDebug("自動完了パスに進みます（リロード後）");
        shouldAutoComplete.current = true;
        setStep("設定を完了中…");
        return; // auto-complete useEffect へ
      } else {
        addDebug(`フラグあり・許可なし: perm=${notifPerm}`);
        setError(`通知が許可されませんでした（permission: ${notifPerm}）。iOSでは「許可」をタップしてください。`);
        setStatus("disabled");
        return;
      }
    }

    // perm=granted だが pref が未設定/denied の場合：
    // 以前に許可済みだがトークン未保存 → 自動で再試行
    if (notifPerm === "granted" && pref !== "granted") {
      addDebug(`perm=granted pref=${pref} → 自動取得開始`);
      shouldAutoComplete.current = true;
      setStep("設定を完了中…");
      return; // auto-complete useEffect へ
    }

    if (notifPerm === "denied") {
      setStatus("blocked");
    } else if (notifPerm === "granted") {
      setStatus("enabled");
    } else {
      setStatus("disabled");
    }
  }, []);

  // 自動トークン取得（user が確定してから実行）
  // shouldAutoComplete.current を ref で管理することで、onStep による step 変化で
  // effect が再実行されて cancelled=true になるバグを防ぐ
  useEffect(() => {
    if (!user) return;
    if (!shouldAutoComplete.current) return;
    shouldAutoComplete.current = false; // 一度だけ実行

    let cancelled = false;
    (async () => {
      setBusy(true);
      addDebug(`自動取得開始 uid=${user.uid.slice(0, 8)}...`);
      try {
        setStep("FCMトークンを取得中…");
        const token = await requestAndGetFcmToken({
          forceRefresh: true,
          onStep: (s) => { addDebug(s); setStep(s); },
        });
        if (cancelled) return;
        addDebug(`token=${token ? token.slice(0, 15) + "..." : "null"}`);
        if (token) {
          localStorage.setItem(PREF_KEY, "granted");
          setStatus("enabled");
          setStep(null);
          addDebug("✓ 有効化完了（保存中）");
          saveFcmToken(user.uid, token)
            .then(() => addDebug("✓ Firestore保存完了"))
            .catch((err: unknown) => addDebug(`保存エラー: ${err instanceof Error ? err.message : String(err)}`));
        } else {
          const perm = typeof Notification !== "undefined" ? Notification.permission : "N/A";
          setError(`トークン取得失敗（permission: ${perm}）。APNs設定またはVAPIDキーを確認してください。`);
          setStatus("disabled");
          setStep(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        addDebug(`エラー: ${msg}`);
        setError(`エラー: ${msg}`);
        setStatus("disabled");
        setStep(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]); // step を依存配列に入れない（onStep で step が変化しても再実行しない）

  async function handleEnable() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    setStep("通知許可を確認中…");
    addDebug(`手動ON開始 perm=${typeof Notification !== "undefined" ? Notification.permission : "N/A"}`);

    try {
      const token = await requestAndGetFcmToken({
        forceRefresh: true,
        onStep: (s) => { addDebug(s); setStep(s); },
      });
      addDebug(`token=${token ? token.slice(0, 15) + "..." : "null"}`);

      if (token) {
        // UIを先に更新してからFirestoreへ保存（保存のハングでUIが止まらないよう）
        localStorage.setItem(PREF_KEY, "granted");
        setStatus("enabled");
        setStep(null);
        addDebug("✓ 有効化完了（保存中）");
        saveFcmToken(user.uid, token)
          .then(() => addDebug("✓ Firestore保存完了"))
          .catch((err: unknown) => addDebug(`保存エラー: ${err instanceof Error ? err.message : String(err)}`));
      } else {
        const perm = typeof Notification !== "undefined" ? Notification.permission : "unknown";
        if (perm === "denied") {
          setStatus("blocked");
          setError("ブラウザで通知がブロックされています。設定から「許可」に変更してください。");
        } else {
          setError(`FCMトークンが取得できませんでした（permission: ${perm}）`);
        }
        setStep(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addDebug(`エラー: ${msg}`);
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
      const token = getCachedFcmToken();
      if (token) await removeFcmToken(user.uid, token).catch(() => {});
    } finally {
      localStorage.setItem(PREF_KEY, "denied");
      clearCachedFcmToken();
      setStatus("disabled");
      setStep(null);
      setBusy(false);
    }
  }

  // ── ローディング中（自動完了処理中もここ） ──
  if (status === "loading") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">プッシュ通知</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {step ?? "読み込み中…"}
        </p>
        <DebugPanel lines={debugLines} />
      </div>
    );
  }

  if (status === "unsupported") {
    return <NotifyRow label="プッシュ通知" sub="このブラウザは対応していません" />;
  }

  if (status === "not-pwa") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">プッシュ通知</p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          iOSでプッシュ通知を使うには、Safariの「共有」→「ホーム画面に追加」でインストールし、ホーム画面から起動してください。
        </p>
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
            {busy && step
              ? step
              : status === "blocked"
                ? "ブラウザで通知がブロックされています"
                : isEnabled
                  ? "掲示板の投稿・返信などをお知らせします"
                  : "タップして有効にする"}
          </p>
        </div>

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
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-wait disabled:opacity-60 ${
              isEnabled ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-600"
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${isEnabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        )}
      </div>

      {status === "blocked" && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          ブラウザの設定 → このサイトの通知を「許可」に変更してからページを再読み込みしてください。
        </p>
      )}

      {error && !busy && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <DebugPanel lines={debugLines} />
    </div>
  );
}

/** 診断用ログパネル（常時表示・後で削除予定） */
function DebugPanel({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-500">
        診断ログ（{lines.length}件）
      </summary>
      <div className="mt-1 rounded bg-zinc-50 p-2 dark:bg-zinc-800">
        {lines.map((l, i) => (
          <p key={i} className="font-mono text-[9px] leading-tight text-zinc-500 dark:text-zinc-400">{l}</p>
        ))}
      </div>
    </details>
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
