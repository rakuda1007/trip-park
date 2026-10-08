"use client";

import { buildWelcomeUrl } from "@/lib/firestore/groups";
import {
  buildInviteShareText,
  buildInviteShareTitle,
  inviteKindLabel,
  inviteJoinNoun,
  resolvePlanShape,
} from "@/lib/plan-shape";
import type { GroupDoc } from "@/types/group";
import { useState } from "react";

const MEMBER_THRESHOLD = 3;

/**
 * メンバーが少ない旅行ホーム向けの招待カード。
 */
export function TripInviteCard({
  group,
  memberCount,
}: {
  group: GroupDoc;
  memberCount: number;
}) {
  const [copied, setCopied] = useState(false);

  if (!group.inviteCode || memberCount >= MEMBER_THRESHOLD) return null;

  const planShape = resolvePlanShape(group);
  const url = buildWelcomeUrl(group.inviteCode);
  const shareText = buildInviteShareText(group.name, planShape, url);
  const shareTitle = buildInviteShareTitle(group.name, planShape);

  async function copyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <section
      className="mt-5 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-4 dark:border-sky-800 dark:bg-sky-950/35"
      aria-label="招待"
    >
      <p className="text-sm font-semibold text-sky-950 dark:text-sky-50">
        メンバーを招待しましょう
      </p>
      <p className="mt-1 text-xs leading-relaxed text-sky-900/90 dark:text-sky-100/85">
        いまの参加者は {memberCount} 人です。リンクを送ると、
        {inviteJoinNoun(planShape)}にすぐ参加できます。
      </p>
      <p className="mt-2 text-[11px] font-medium text-sky-800 dark:text-sky-200">
        {inviteKindLabel(planShape)}
      </p>
      <p className="mt-1 break-all font-mono text-[11px] text-sky-900 dark:text-sky-100">
        {url}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-md bg-sky-700 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-sky-800"
        >
          {copied ? "コピーしました ✓" : "リンクをコピー"}
        </button>
        <a
          href={`https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md bg-[#06C755] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#05b34c]"
        >
          LINEで送る
        </a>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.share({
                  title: shareTitle,
                  text: `${inviteKindLabel(planShape)}「${group.name}」`,
                  url,
                });
              } catch {
                // cancel
              }
            }}
            className="rounded-md border border-sky-300 px-2.5 py-1.5 text-[11px] font-medium text-sky-950 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-50 dark:hover:bg-sky-900/50"
          >
            その他で共有
          </button>
        ) : null}
      </div>
    </section>
  );
}
