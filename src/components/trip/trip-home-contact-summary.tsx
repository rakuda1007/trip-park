"use client";

import { formatNearbyMapTopicHeadingTitle } from "@/components/bulletin/nearby-map-topic-display";
import {
  BULLETIN_CATEGORY_LABELS,
  type BulletinTopicDoc,
} from "@/types/bulletin";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";

function formatTsShort(v: unknown): string {
  if (!v) return "—";
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "—";
}

function tsToMs(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  return 0;
}

function contactHeadingTitle(data: BulletinTopicDoc): string {
  if (data.category === "nearby_map") {
    return formatNearbyMapTopicHeadingTitle(data.title);
  }
  return data.title;
}

type TopicRow = {
  id: string;
  data: BulletinTopicDoc;
  replyCount: number;
};

export function TripHomeContactSummary({
  groupId,
  topics,
}: {
  groupId: string;
  topics: TopicRow[];
}) {
  // レシピ投票は旅程の献立導線へ寄せるため、連絡サマリからは除外
  const contactTopics = topics.filter((t) => t.data.category !== "recipe_vote");
  const latest =
    contactTopics.length === 0
      ? null
      : [...contactTopics].sort(
          (a, b) => tsToMs(b.data.updatedAt) - tsToMs(a.data.updatedAt),
        )[0]!;

  const openHref = `/groups/${groupId}/bulletin`;
  const newHref = `/groups/${groupId}/bulletin?new=1`;

  return (
    <section
      className={`mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60`}
    >
      <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-emerald-50/95 to-white px-4 py-4 dark:border-emerald-900/45 dark:from-emerald-950/50 dark:via-emerald-950/35 dark:to-zinc-900/80">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-emerald-200/90 dark:bg-zinc-900 dark:ring-emerald-800/60"
              aria-hidden
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            </div>
            <h2 className="whitespace-nowrap text-sm font-semibold leading-none tracking-tight text-emerald-950 dark:text-emerald-100">
              連絡
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Link
              href={newHref}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              新しい連絡
            </Link>
            <Link
              href={openHref}
              className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-200"
            >
              連絡を開く
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {!latest ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              まだ連絡がありません
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={newHref}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                新しい連絡
              </Link>
              <Link
                href={openHref}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                連絡を開く
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/groups/${groupId}/bulletin/${latest.id}`}
              className="block rounded-lg border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                  {contactHeadingTitle(latest.data)}
                </h3>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  返信 {latest.replyCount} 件
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {BULLETIN_CATEGORY_LABELS[latest.data.category]}
                </span>
                <span>更新 {formatTsShort(latest.data.updatedAt)}</span>
              </div>
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Link
                href={newHref}
                className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
              >
                新しい連絡
              </Link>
              <Link
                href={openHref}
                className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline dark:text-emerald-200"
              >
                連絡を開く
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
