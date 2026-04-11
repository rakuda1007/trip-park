"use client";

import { useAuth } from "@/contexts/auth-context";
import { listMyGroups } from "@/lib/firestore/groups";
import type { UserGroupRefDoc } from "@/types/group";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function GroupsClient() {
  const { user } = useAuth();
  const [items, setItems] = useState<{ groupId: string; data: UserGroupRefDoc }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listMyGroups(user.uid);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          グループ
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/groups/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            グループを作成
          </Link>
          <Link
            href="/join"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            招待コードで参加
          </Link>
        </div>
      </div>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        旅行・キャンプごとの共有スペースです。オーナーがグループを作成し、招待コードでメンバーが参加します。
      </p>

      {error ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
          まだグループに参加していません。作成するか、招待コードで参加してください。
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {items.map(({ groupId, data }) => (
            <li key={groupId}>
              <Link
                href={`/groups/${groupId}`}
                className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {data.groupName}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {data.role === "owner"
                    ? "オーナー"
                    : data.role === "admin"
                      ? "管理者"
                      : "メンバー"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
