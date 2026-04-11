"use client";

import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";

export function DashboardHome() {
  const { user } = useAuth();
  const label = user?.displayName || user?.email || "ユーザー";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        ダッシュボード
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        こんにちは、{label} さん。
      </p>
      <div className="mt-8">
        <Link
          href="/groups"
          className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          グループ一覧へ
        </Link>
      </div>
    </div>
  );
}
