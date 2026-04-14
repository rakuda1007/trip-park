"use client";

import { useAuth } from "@/contexts/auth-context";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getGroup, listMembers } from "@/lib/firestore/groups";
import type { GroupDoc, GroupRole, MemberDoc } from "@/types/group";
import type { NotifyStatusResponse } from "@/app/api/admin/notify-status/route";
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

function NotifyBadge({ count }: { count: number | undefined }) {
  if (count === undefined) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
          <path d="M4.47 2.47a.75.75 0 0 0-1.06 1.06l1.462 1.461A6.482 6.482 0 0 0 3.019 8.25H2a.75.75 0 0 0 0 1.5h1.019a6.49 6.49 0 0 0 2.358 4.14L4.47 14.47a.75.75 0 1 0 1.06 1.06l9-9a.75.75 0 1 0-1.06-1.06L12.44 6.5A6.482 6.482 0 0 0 12.981 8.25H14a.75.75 0 0 0 0-1.5h-1.019a6.49 6.49 0 0 0-2.358-4.14l1.907-1.906A.75.75 0 1 0 11.47 .47L4.47 2.47Z" />
        </svg>
        未設定
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M8 1.5A6.5 6.5 0 1 0 8 14.5 6.5 6.5 0 0 0 8 1.5Zm3.78 4.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L4.22 8.78a.75.75 0 0 1 1.06-1.06L7 9.44l3.72-3.72a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
      </svg>
      有効（{count}台）
    </span>
  );
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
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getGroup(groupId), listMembers(groupId)])
      .then(([g, ms]) => {
        if (!g) { router.replace(`/groups/${groupId}`); return; }
        const me = ms.find((m) => m.userId === user.uid);
        if (!me || (me.data.role !== "owner" && me.data.role !== "admin")) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        setGroup(g);
        setMembers(ms);
        setLoading(false);

        // 通知状況を別途取得
        getFirebaseAuth().currentUser?.getIdToken().then((idToken) => {
          fetch(`/api/admin/notify-status?groupId=${encodeURIComponent(groupId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          })
            .then((res) => res.ok ? res.json() : null)
            .then((data: NotifyStatusResponse | null) => {
              if (data) setDeviceCounts(data.deviceCounts);
            })
            .catch(() => {});
        }).catch(() => {});
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

  const enabledCount = deviceCounts
    ? Object.values(deviceCounts).filter((n) => n > 0).length
    : null;

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

      {/* Push通知サマリー */}
      {deviceCounts !== null && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-600 dark:text-green-400">
              <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.091 32.091 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.085 32.085 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Push通知
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {enabledCount} / {members.length} 名が有効
            </p>
          </div>
        </div>
      )}

      {/* メンバー一覧テーブル */}
      <section className="mt-6">
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
                <th className="px-4 py-2.5 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Push通知</th>
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
                      <span className="text-[10px] text-zinc-400">（あなた）</span>
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
                  <td className="px-4 py-3">
                    <NotifyBadge count={deviceCounts?.[userId]} />
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
