"use client";

import { useAuth } from "@/contexts/auth-context";
import { loadLastTripId } from "@/lib/last-trip";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const label = user?.displayName || user?.email || "ユーザー";

  useEffect(() => {
    if (!user) return;
    const lastTripId = loadLastTripId(user.uid);
    if (lastTripId) {
      router.replace(`/groups/${lastTripId}`);
    } else {
      setChecked(true);
    }
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
