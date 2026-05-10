"use client";

import type { DashboardInsights } from "@/lib/trip-dashboard-insights";
import Link from "next/link";
import { useEffect, useState } from "react";

export function TripDashboardInsightsPanel({
  insights,
  allWorkflowComplete,
}: {
  insights: DashboardInsights | null;
  allWorkflowComplete: boolean;
}) {
  const [expanded, setExpanded] = useState(!allWorkflowComplete);

  useEffect(() => {
    setExpanded(!allWorkflowComplete);
  }, [allWorkflowComplete]);

  if (!insights) return null;

  const { nextStepLine, nextStepLink, statusLines, personalTasks } = insights;

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/50">
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

          {personalTasks.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300">
                あなたへのお願い
              </h3>
              <ul className="mt-2 space-y-2">
                {personalTasks.map((t) => (
                  <li key={t.key}>
                    <Link
                      href={t.href}
                      className="text-sm font-medium text-amber-950 underline-offset-2 hover:underline dark:text-amber-100"
                    >
                      {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              あなたの未対応の投票は、いまは検出されていません。
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
