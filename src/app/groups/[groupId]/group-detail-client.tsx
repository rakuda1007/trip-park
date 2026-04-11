"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  buildJoinUrl,
  deleteGroup,
  getGroup,
  leaveGroup,
  listMembers,
  removeMember,
} from "@/lib/firestore/groups";
import type { GroupDoc, MemberDoc } from "@/types/group";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function GroupDetailClient() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { user } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDoc | null | undefined>(undefined);
  const [members, setMembers] = useState<{ userId: string; data: MemberDoc }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const g = await getGroup(groupId);
      setGroup(g);
      if (g) {
        const m = await listMembers(groupId);
        setMembers(m);
      } else {
        setMembers([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setGroup(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = user && group && user.uid === group.ownerId;
  const inviteUrl = group ? buildJoinUrl(group.inviteCode) : "";

  async function copyInvite() {
    if (!group || typeof navigator === "undefined" || !navigator.clipboard) return;
    const url = buildJoinUrl(group.inviteCode);
    try {
      await navigator.clipboard.writeText(url);
      setBusy("copied");
      setTimeout(() => setBusy(null), 2000);
    } catch {
      setError("コピーに失敗しました");
    }
  }

  async function handleLeave() {
    if (!user || !groupId) return;
    if (!confirm("このグループから抜けますか？")) return;
    setBusy("leave");
    setError(null);
    try {
      await leaveGroup(user.uid, groupId);
      router.push("/groups");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteGroup() {
    if (!user || !groupId) return;
    if (
      !confirm(
        "グループを削除します。メンバー全員がアクセスできなくなります。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      await deleteGroup(user.uid, groupId);
      router.push("/groups");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveMember(targetUid: string) {
    if (!user || !groupId) return;
    if (!confirm("このメンバーをグループから外しますか？")) return;
    setBusy(`remove-${targetUid}`);
    setError(null);
    try {
      await removeMember(user.uid, groupId, targetUid);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(null);
    }
  }

  if (group === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </div>
    );
  }

  if (group === null) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-600">グループが見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm text-zinc-900 underline">
          グループ一覧へ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link
        href="/groups"
        className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← グループ一覧
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {group.name}
      </h1>
      {group.description ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {group.description}
        </p>
      ) : null}

      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href={`/groups/${groupId}/schedule`}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          日程調整へ
        </Link>
        <Link
          href={`/groups/${groupId}/bulletin`}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          掲示板へ
        </Link>
        <Link
          href={`/groups/${groupId}/trip`}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          目的地・旅程へ
        </Link>
        <Link
          href={`/groups/${groupId}/expenses`}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          支出・精算へ
        </Link>
        <Link
          href={`/groups/${groupId}/families`}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          家族（世帯）へ
        </Link>
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          招待
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          招待コード:{" "}
          <span className="font-mono font-semibold">{group.inviteCode}</span>
        </p>
        <p className="mt-2 break-all text-xs text-zinc-500">{inviteUrl}</p>
        <button
          type="button"
          onClick={copyInvite}
          disabled={busy !== null}
          className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy === "copied" ? "コピーしました" : "招待リンクをコピー"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          メンバー
        </h2>
        <ul className="mt-3 space-y-2">
          {members.map(({ userId, data }) => (
            <li
              key={userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/40"
            >
              <span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {data.displayName || userId.slice(0, 8) + "…"}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {data.role === "owner"
                    ? "オーナー"
                    : data.role === "admin"
                      ? "管理者"
                      : "メンバー"}
                </span>
                {userId === user?.uid ? (
                  <span className="ml-1 text-xs text-emerald-600">（あなた）</span>
                ) : null}
              </span>
              {isOwner && userId !== group.ownerId ? (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(userId)}
                  disabled={busy !== null}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  外す
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-zinc-200 pt-8 dark:border-zinc-700">
        {!isOwner ? (
          <button
            type="button"
            onClick={handleLeave}
            disabled={busy !== null}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busy === "leave" ? "処理中…" : "グループを抜ける"}
          </button>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            onClick={handleDeleteGroup}
            disabled={busy !== null}
            className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
          >
            {busy === "delete" ? "削除中…" : "グループを削除"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
