"use client";

import { BulletinRichBody } from "@/components/bulletin/bulletin-rich-body";
import {
  BULLETIN_CATEGORY_LABELS,
  type NearbyMapSpot,
} from "@/types/bulletin";

/** 件名がカテゴリ名だけのとき、一覧で冗長に見えないよう差し替え */
export function formatNearbyMapTopicHeadingTitle(title: string): string {
  const t = title.trim();
  if (t === BULLETIN_CATEGORY_LABELS.nearby_map || t === "周辺地図") {
    return "立ち寄り先・周辺地図";
  }
  return title;
}

/** 本文が空、またはいずれかの場所名と同一（HTML 除去後のプレーンテキスト比較）なら補足を出さない */
export function shouldShowNearbyMapBodyNote(
  body: string,
  spots: NearbyMapSpot[],
): boolean {
  const raw = body.trim();
  if (!raw) return false;
  const plain = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return false;
  return !spots.some((s) => s.name.trim() === plain);
}

type NearbyMapTopicDisplayProps = {
  body: string;
  spots: NearbyMapSpot[];
};

/**
 * 周辺地図トピック用：全幅カードで立ち寄り先を並べ、地図導線を大きくする。
 */
export function NearbyMapTopicDisplay({
  body,
  spots,
}: NearbyMapTopicDisplayProps) {
  const showNote = shouldShowNearbyMapBodyNote(body, spots);
  const single = spots.length === 1;

  return (
    <div className="w-full min-w-0 space-y-3">
      {showNote ? (
        <div className="rounded-lg border border-zinc-200/90 bg-white px-3 py-2.5 dark:border-zinc-600 dark:bg-zinc-900/60">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            補足
          </p>
          <BulletinRichBody
            body={body}
            className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200"
          />
        </div>
      ) : null}

      {spots.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
            立ち寄り先
          </p>
          <ul className="space-y-2.5">
            {spots.map((spot, idx) => (
              <li
                key={`${spot.name}-${idx}`}
                className="rounded-xl border border-emerald-200/80 bg-white p-3 shadow-sm dark:border-emerald-900/50 dark:bg-zinc-900/70"
              >
                <div
                  className={
                    single
                      ? "flex flex-col gap-3"
                      : "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  }
                >
                  <p className="min-w-0 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                    {spot.name}
                  </p>
                  <a
                    href={spot.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      single
                        ? "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-700/20 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        : "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 sm:self-start"
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.75}
                      stroke="currentColor"
                      className="h-4 w-4 shrink-0"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                      />
                    </svg>
                    地図を開く
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
          登録された立ち寄り先はまだありません。
        </p>
      )}
    </div>
  );
}
