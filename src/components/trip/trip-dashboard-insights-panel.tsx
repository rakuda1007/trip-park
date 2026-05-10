"use client";

import type { DashboardInsights } from "@/lib/trip-dashboard-insights";
import Link from "next/link";
import { useState } from "react";

export function TripDashboardInsightsPanel({
  insights,
  allWorkflowComplete,
}: {
  insights: DashboardInsights | null;
  allWorkflowComplete: boolean;
}) {
  /** 次のステップ・お願いで足りるため、進捗の詳細はデフォルト非表示 */
  const [expanded, setExpanded] = useState(false);

  if (!insights) return null;

  const { nextStepLine, nextStepLink, statusLines, personalTasks } = insights;
  const hasPersonal = personalTasks.length > 0;

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/50">
      {hasPersonal ? (
        <div className="border-b border-amber-200/80 bg-gradient-to-b from-amber-50 to-amber-50/60 px-4 py-4 dark:border-amber-900/40 dark:from-amber-950/35 dark:to-amber-950/20">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            あなたへのお願い（タップで移動）
          </h3>
          <ul className="mt-3 space-y-2.5">
            {personalTasks.map((t) => (
              <li key={t.key}>
                <Link
                  href={t.href}
                  className="flex min-h-[3rem] items-center justify-between gap-3 rounded-xl border-2 border-amber-400/90 bg-white px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm ring-1 ring-amber-200/80 transition hover:border-amber-500 hover:bg-amber-50 hover:shadow-md active:scale-[0.99] dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800 dark:hover:bg-amber-950/60"
                >
                  <span className="text-left leading-snug">{t.label}</span>
                  <span
                    className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-bold text-white dark:bg-amber-500"
                    aria-hidden
                  >
                    開く
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={`border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 ${
          allWorkflowComplete
            ? "bg-emerald-50/80 dark:bg-emerald-950/25"
            : "bg-sky-50/80 dark:bg-sky-950/20"
        }`}
      >
        <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
          {nextStepLine}
        </p>
        {nextStepLink ? (
          <div className="mt-3">
            <Link
              href={nextStepLink.href}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {nextStepLink.label}
            </Link>
          </div>
        ) : null}
        {allWorkflowComplete ? (
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
            工程は一通り完了しています。下のトピックでやり取りを続けられます。
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {expanded ? "進捗の詳細" : "進捗の詳細を表示"}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-expanded={expanded}
        >
          {expanded ? "閉じる" : "開く"}
        </button>
      </div>

      {expanded ? (
        <div className="space-y-4 px-4 py-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              この旅行のいま（自動）
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {statusLines.map((line, i) => (
                <li key={i} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {!hasPersonal ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              あなたの未対応の投票は、いまは検出されていません。
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              未対応は上の「あなたへのお願い」から開けます。
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
