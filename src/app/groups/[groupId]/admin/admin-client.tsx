"use client";

import { useAuth } from "@/contexts/auth-context";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import type { GroupDoc, GroupRole, MemberDoc } from "@/types/group";
import { Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLE_LABELS: Record<GroupRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
};

function formatTs(v: unknown): string {
  if (!v) return "—";
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "—";
}

export function AdminClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([getGroup(groupId), listMembers(groupId)])
      .then(([g, ms]) => {
        if (!g) { router.replace(`/groups/${groupId}`); return; }
        // オーナーまたは管理者のみアクセス可
        const me = ms.find((m) => m.userId === user.uid);
        if (!me || (me.data.role !== "owner" && me.data.role !== "admin")) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        setGroup(g);
        setMembers(ms);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, groupId, router]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-sm text-red-500">このページはオーナーまたは管理者のみアクセスできます。</p>
        <Link href={`/groups/${groupId}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← 旅行詳細に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href={`/groups/${groupId}`}
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← {group?.name ?? "旅行詳細"}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        管理者メニュー
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {group?.name} のメンバー状況を確認できます。
      </p>

      {/* メンバー一覧テーブル */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          メンバー一覧（{members.length} 名）
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/60">
                <th className="px-4 py-2.5 font-medium text-zinc-600 dark:text-zinc-400">表示名</th>
                <th className="px-4 py-2.5 font-medium text-zinc-600 dark:text-zinc-400">役割</th>
                <th className="px-4 py-2.5 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">参加日時</th>
                <th className="px-4 py-2.5 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">最終アクセス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700/60 dark:bg-zinc-900">
              {members.map(({ userId, data }) => (
                <tr key={userId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    <div className="font-medium">
                      {data.displayName ?? "（名前なし）"}
                    </div>
                    {userId === user?.uid && (
                      <span className="ml-1 text-[10px] text-zinc-400">（あなた）</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      data.role === "owner"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : data.role === "admin"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}>
                      {ROLE_LABELS[data.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    {formatTs(data.joinedAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    {formatTs(data.lastAccessAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          ※ 最終アクセスはグループページを開いたときに更新されます（セッション単位）。
        </p>
      </section>
    </div>
  );
}
