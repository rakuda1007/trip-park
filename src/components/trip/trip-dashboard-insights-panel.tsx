"use client";

import type { DashboardInsights } from "@/lib/trip-dashboard-insights";
import Link from "next/link";

export function TripDashboardInsightsPanel({
  insights,
  allWorkflowComplete,
}: {
  insights: DashboardInsights | null;
  allWorkflowComplete: boolean;
}) {
  if (!insights) return null;

  const { nextStepLine, nextStepLink, personalTasks } = insights;
  const hasPersonal = personalTasks.length > 0;

  const nextStepCtaClass = allWorkflowComplete
    ? "inline-flex items-center justify-center rounded-lg border-2 border-emerald-600/55 bg-emerald-50/95 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-200/70 transition hover:border-emerald-600 hover:bg-emerald-100/95 active:scale-[0.99] dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800/50 dark:hover:bg-emerald-900/55"
    : "inline-flex items-center justify-center rounded-lg border-2 border-sky-600/45 bg-white/90 px-4 py-2.5 text-sm font-semibold text-sky-950 shadow-sm ring-1 ring-sky-200/80 transition hover:border-sky-600/70 hover:bg-sky-50/95 active:scale-[0.99] dark:border-sky-500/45 dark:bg-sky-950/35 dark:text-sky-50 dark:ring-sky-800/40 dark:hover:bg-sky-900/45";

  return (
    <section className="my-5 rounded-xl border border-zinc-200 bg-white sm:my-6 dark:border-zinc-700 dark:bg-zinc-900/50">
      {hasPersonal ? (
        <div className="border-b border-amber-200/80 bg-gradient-to-b from-amber-50 to-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:from-amber-950/35 dark:to-amber-950/20">
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
        className={`border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 ${
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
            <Link href={nextStepLink.href} className={nextStepCtaClass}>
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
    </section>
  );
}
