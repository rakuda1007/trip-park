"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  buildWelcomeUrl,
  deleteGroup,
  getGroup,
  leaveGroup,
  listMembers,
  removeMember,
  updateDestination,
  updateGroupTripDates,
  updateTripStatus,
} from "@/lib/firestore/groups";
import { saveLastTripId } from "@/lib/last-trip";
import type { GroupDoc, MemberDoc, TripStatus } from "@/types/group";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function formatDateRange(start: string, end?: string | null): string {
  const ps = start.split("-").map(Number);
  if (ps.length !== 3 || ps.some(Number.isNaN)) return start;
  const [sy, sm, sd] = ps;
  if (!end || end === start) return `${sy}年${sm}月${sd}日`;
  const pe = end.split("-").map(Number);
  if (pe.length !== 3 || pe.some(Number.isNaN)) return `${start} 〜 ${end}`;
  const [ey, em, ed] = pe;
  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}日 〜 ${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日 〜 ${em}月${ed}日`;
  return `${sy}年${sm}月${sd}日 〜 ${ey}年${em}月${ed}日`;
}

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

  // 旅行日程編集用
  const [editingDates, setEditingDates] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  // 目的地編集用
  const [editingDest, setEditingDest] = useState(false);
  const [draftDest, setDraftDest] = useState("");

  // 旅行ページを開いたら直近アクセス旅行として記録
  useEffect(() => {
    if (user && groupId) {
      saveLastTripId(user.uid, groupId);
    }
  }, [user, groupId]);

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
  // 未ユーザーでも開けるランディングURLを招待リンクとして使う
  const inviteUrl = group ? buildWelcomeUrl(group.inviteCode) : "";

  function startEditDates() {
    if (!group) return;
    setDraftStart(group.tripStartDate ?? "");
    setDraftEnd(group.tripEndDate ?? "");
    setEditingDates(true);
  }

  async function handleSaveDates() {
    if (!groupId) return;
    if (draftStart && draftEnd && draftEnd < draftStart) {
      setError("終了日は開始日以降にしてください。");
      return;
    }
    setBusy("save-dates");
    setError(null);
    try {
      await updateGroupTripDates(
        groupId,
        draftStart || null,
        draftEnd || draftStart || null,
      );
      setEditingDates(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveDest() {
    if (!groupId) return;
    setBusy("save-dest");
    setError(null);
    try {
      await updateDestination(groupId, draftDest.trim() || null);
      setEditingDest(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateStatus(status: TripStatus) {
    if (!groupId) return;
    setBusy(`status-${status}`);
    setError(null);
    try {
      await updateTripStatus(groupId, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    if (!group || typeof navigator === "undefined" || !navigator.clipboard) return;
    const url = buildWelcomeUrl(group.inviteCode);
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
    if (!confirm("この旅行から抜けますか？")) return;
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
        "旅行を削除します。メンバー全員がアクセスできなくなります。よろしいですか？",
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
    if (!confirm("このメンバーを旅行から外しますか？")) return;
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
        <p className="text-sm text-zinc-600">旅行が見つかりません。</p>
        <Link href="/groups" className="mt-4 inline-block text-sm text-zinc-900 underline">
          旅行一覧へ
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
        ← 旅行一覧
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {group.name}
      </h1>

      {/* フェーズバッジ */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(() => {
          const s = group.status ?? "planning";
          if (s === "planning")
            return (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                計画中
              </span>
            );
          if (s === "confirmed")
            return (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                旅行確定
              </span>
            );
          return (
            <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              旅行終了
            </span>
          );
        })()}
        {/* オーナーがフェーズを変更できるボタン */}
        {isOwner && (group.status ?? "planning") === "planning" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => handleUpdateStatus("confirmed")}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            {busy === "status-confirmed" ? "更新中…" : "旅行を確定する →"}
          </button>
        ) : null}
        {isOwner && (group.status ?? "planning") === "confirmed" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => handleUpdateStatus("completed")}
            className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
          >
            {busy === "status-completed" ? "更新中…" : "旅行終了にする →"}
          </button>
        ) : null}
      </div>

      {group.description ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {group.description}
        </p>
      ) : null}

      {/* 目的地 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {group.destination ? (
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            📍 {group.destination}
          </span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">目的地未定</span>
        )}
        {isOwner && !editingDest ? (
          <button
            type="button"
            onClick={() => {
              setDraftDest(group.destination ?? "");
              setEditingDest(true);
            }}
            className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {group.destination ? "目的地を変更" : "目的地を設定"}
          </button>
        ) : null}
      </div>

      {/* 目的地編集フォーム */}
      {editingDest && isOwner ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={draftDest}
            onChange={(e) => setDraftDest(e.target.value)}
            placeholder="例: 箱根"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleSaveDest}
            disabled={busy !== null}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === "save-dest" ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => setEditingDest(false)}
            className="text-xs text-zinc-500 underline hover:text-zinc-800"
          >
            キャンセル
          </button>
        </div>
      ) : null}

      {/* 旅行日程 */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {group.tripStartDate ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span>📅</span>
            {formatDateRange(group.tripStartDate, group.tripEndDate)}
          </span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            日程未定
          </span>
        )}
        {isOwner && !editingDates ? (
          <button
            type="button"
            onClick={startEditDates}
            className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {group.tripStartDate ? "日程を変更" : "旅行日程を設定"}
          </button>
        ) : null}
      </div>

      {/* 日程編集フォーム（オーナーのみ） */}
      {editingDates && isOwner ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            旅行日程を設定
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            日程調整で確定した場合は自動的に反映されます。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              開始日
              <input
                type="date"
                value={draftStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftStart(v);
                  setDraftEnd((prev) => (!prev || prev < v ? v : prev));
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              終了日
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSaveDates}
              disabled={busy !== null}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy === "save-dates" ? "保存中…" : "保存"}
            </button>
            {group.tripStartDate ? (
              <button
                type="button"
                onClick={async () => {
                  setDraftStart("");
                  setDraftEnd("");
                  setBusy("save-dates");
                  try {
                    await updateGroupTripDates(groupId, null, null);
                    setEditingDates(false);
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "クリアに失敗しました");
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={busy !== null}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
              >
                日程をクリア
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditingDates(false)}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href={`/groups/${groupId}/schedule`}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          日程調整へ
        </Link>
        {(group.status ?? "planning") === "planning" ? (
          <Link
            href={`/groups/${groupId}/destination-votes`}
            className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
          >
            目的地を決める
          </Link>
        ) : null}
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
          旅程へ
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
          参加世帯へ
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
            {busy === "leave" ? "処理中…" : "旅行から抜ける"}
          </button>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            onClick={handleDeleteGroup}
            disabled={busy !== null}
            className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
          >
            {busy === "delete" ? "削除中…" : "旅行を削除"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
