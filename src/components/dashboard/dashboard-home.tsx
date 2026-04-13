"use client";

import { useAuth } from "@/contexts/auth-context";
import { listMyGroups } from "@/lib/firestore/groups";
import { loadLastTripId } from "@/lib/last-trip";
import type { UserGroupRefDoc } from "@/types/group";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function getTodayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * 旅行リストから最適な旅行IDを選ぶ
 * 優先順: 旅行中 → 直近の未来旅行 → 最近の過去旅行 → 日程未定
 */
function pickBestTripId(
  items: { groupId: string; data: UserGroupRefDoc }[],
  today: string,
): string | null {
  if (items.length === 0) return null;

  const active = items.filter(({ data }) => {
    const { tripStartDate, tripEndDate } = data;
    if (!tripStartDate) return false;
    const end = tripEndDate ?? tripStartDate;
    return tripStartDate <= today && today <= end;
  });

  const upcoming = items
    .filter(({ data }) => {
      const { tripStartDate } = data;
      return tripStartDate != null && tripStartDate > today;
    })
    .sort((a, b) =>
      (a.data.tripStartDate ?? "").localeCompare(b.data.tripStartDate ?? ""),
    );

  const past = items
    .filter(({ data }) => {
      const { tripStartDate, tripEndDate } = data;
      if (!tripStartDate) return false;
      const end = tripEndDate ?? tripStartDate;
      return end < today;
    })
    .sort((a, b) =>
      (b.data.tripEndDate ?? b.data.tripStartDate ?? "").localeCompare(
        a.data.tripEndDate ?? a.data.tripStartDate ?? "",
      ),
    );

  const undecided = items.filter(({ data }) => !data.tripStartDate);

  return (
    active[0]?.groupId ??
    upcoming[0]?.groupId ??
    past[0]?.groupId ??
    undecided[0]?.groupId ??
    null
  );
}

export function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const label = user?.displayName || user?.email || "ユーザー";

  useEffect(() => {
    if (!user) return;

    // 前回アクセスした旅行があればそちらを優先
    const lastTripId = loadLastTripId(user.uid);
    if (lastTripId) {
      router.replace(`/groups/${lastTripId}`);
      return;
    }

    // なければ旅行リストを取得して最適な旅行へ自動遷移
    listMyGroups(user.uid).then((items) => {
      const today = getTodayISO();
      const bestId = pickBestTripId(items, today);
      if (bestId) {
        router.replace(`/groups/${bestId}`);
      } else {
        setChecked(true);
      }
    }).catch(() => {
      setChecked(true);
    });
  }, [user, router]);

  // リダイレクト中 or uid 待機中は何も表示しない
  if (!checked) return null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        ダッシュボード
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        こんにちは、{label} さん。
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        まだ旅行がありません。旅行を作成するか、招待リンクから参加しましょう。
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/groups/new"
          className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          旅行を作成する
        </Link>
        <Link
          href="/groups"
          className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          旅行一覧
        </Link>
      </div>
    </div>
  );
}
