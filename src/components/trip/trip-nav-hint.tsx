"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "trip-park:navHintDismissed";

/**
 * 初回だけ表示するナビ役割の短いヒント。
 * 上＝計画の進み具合 / 下（モバイル）＝画面移動。
 */
export function TripNavHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      // localStorage 不可時は毎回出さない（邪魔になるため非表示）
      return;
    }
    setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  return (
    <div className="shrink-0 border-b border-teal-100 bg-teal-50/90 dark:border-teal-900/50 dark:bg-teal-950/40">
      <div className="mx-auto flex max-w-3xl items-start gap-3 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-teal-950 dark:text-teal-100">
          <span className="md:hidden">
            上のバーは計画の進み具合、下のメニューでホーム・計画・連絡へ移動できます。
          </span>
          <span className="hidden md:inline">
            上のバーは計画の進み具合です。連絡・買い出しもここから開けます。
          </span>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100 dark:text-teal-200 dark:hover:bg-teal-900/60"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
